/**
 * One-time conversion script: Astro content → Obsidian vault format
 * 
 * Reads from: src/content/prints/*.md
 * Writes to:  $VAULT_DIR/Prints/ (set in .env or environment)
 * 
 * Transforms:
 * - Nested frontmatter → flat frontmatter
 * - Structured arrays (museums, drawings, publications) → markdown sections
 * - Cross-reference anchors (#id) → Obsidian wikilinks
 * - Image references → ![[filename]] embeds
 */

import matter from 'gray-matter';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

if (!process.env.VAULT_DIR) {
    console.error('ERROR: VAULT_DIR environment variable is not set.');
    console.error('Set it in .env or export it in your shell. See .env.example.');
    process.exit(1);
}

const PRINTS_DIR = join(import.meta.dirname, '..', 'src', 'content', 'prints');
const VAULT_DIR = join(process.env.VAULT_DIR.replace(/^~/, process.env.HOME), 'Prints');

// Build cross-reference map: id → { title, filename }
const crossRefMap = new Map();

const files = readdirSync(PRINTS_DIR).filter(f => f.endsWith('.md'));

for (const file of files) {
    const raw = readFileSync(join(PRINTS_DIR, file), 'utf-8');
    const { data } = matter(raw);
    const padded = String(data.id).padStart(2, '0');
    const vaultFilename = `${padded} - ${data.title}`;
    crossRefMap.set(data.id, { title: data.title, vaultFilename });
}

console.log(`Built cross-reference map with ${crossRefMap.size} entries.\n`);

// Convert each print
for (const file of files) {
    const raw = readFileSync(join(PRINTS_DIR, file), 'utf-8');
    const { data, content } = matter(raw);

    // --- Build flat frontmatter ---
    const fm = {};
    fm.id = data.id;
    fm.title = data.title;
    fm.slug = file.replace(/\.md$/, ''); // preserve original Astro slug
    fm.year = data.year;

    // Image fields
    if (data.image?.filename) {
        fm.image = data.image.filename;
    } else {
        fm.image = '';
    }

    if (data.image?.caption) {
        fm.image_caption = data.image.caption;
    }

    // Size fields
    if (data.size?.dimensions) {
        fm.dimensions = data.size.dimensions;
    }
    if (data.size?.source) {
        fm.dimensions_source = data.size.source;
    }
    if (data.size?.source_url) {
        fm.dimensions_source_url = data.size.source_url;
    }

    // Simple fields
    if (data.signed) {
        fm.signed = data.signed;
    }

    // Normalize boolean
    fm.complete = data.complete === true || data.complete === 'True' || data.complete === 'true';

    // --- Build body ---
    const bodyParts = [];

    // Image embed or missing-image note
    if (data.image?.filename) {
        bodyParts.push(`![[${data.image.filename}]]`);
        if (data.image.caption) {
            bodyParts.push(`*${data.image.caption}*`);
        }
    } else if (data.image?.missing_text) {
        // Parse markdown links in missing_text — they're already markdown, just use directly
        bodyParts.push(data.image.missing_text);
    } else {
        bodyParts.push('No image available.');
    }

    // Publications section
    if (data.publications && data.publications.length > 0) {
        bodyParts.push('');
        bodyParts.push('## Publications');
        for (const pub of data.publications) {
            // Publications use markdown italics with underscores in YAML values
            // They're already valid markdown, just output them
            bodyParts.push(`- ${pub}`);
        }
    }

    // Related drawings section
    if (data.drawings && data.drawings.length > 0) {
        bodyParts.push('');
        bodyParts.push('## Related Drawings');
        for (const d of data.drawings) {
            bodyParts.push(`- [${d.name}](${d.url})`);
        }
    }

    // Collections section
    if (data.museums && data.museums.length > 0) {
        bodyParts.push('');
        bodyParts.push('## Collections');
        for (const m of data.museums) {
            bodyParts.push(`- [${m.name}](${m.url})`);
        }
    }

    // Notes section (original markdown body)
    const trimmedContent = content.trim();
    if (trimmedContent) {
        // Replace cross-reference anchors: [Title](#id) → [[vaultFilename|Title]]
        let notes = trimmedContent;
        notes = notes.replace(/\[([^\]]+)\]\(#(\d+)\)/g, (match, linkText, id) => {
            const ref = crossRefMap.get(parseInt(id));
            if (ref) {
                return `[[${ref.vaultFilename}|${linkText}]]`;
            }
            console.warn(`  WARNING: Cross-reference #${id} not found in ${file}`);
            return match;
        });

        bodyParts.push('');
        bodyParts.push('## Notes');
        bodyParts.push(notes);
    }

    // --- Serialize ---
    const fmYaml = matter.stringify('', fm).trim();
    const body = bodyParts.join('\n');
    const output = `${fmYaml}\n${body}\n`;

    // Write to vault
    const padded = String(data.id).padStart(2, '0');
    const vaultFilename = `${padded} - ${data.title}.md`;
    const outPath = join(VAULT_DIR, vaultFilename);
    writeFileSync(outPath, output, 'utf-8');
    console.log(`  ${vaultFilename}`);
}

console.log(`\nConverted ${files.length} prints to vault format.`);
