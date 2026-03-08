#!/usr/bin/env node

/**
 * Build script: Obsidian vault → Astro content
 * 
 * Reads from:  $VAULT_DIR (set in .env or environment)
 * Writes to:   src/content/prints/*.md and src/assets/prints/*
 * 
 * Transforms:
 * - Flat frontmatter → nested Astro schema
 * - Markdown sections (Publications, Drawings, Collections) → structured YAML arrays
 * - Obsidian wikilinks → anchor cross-references
 * - ![[filename]] embeds → frontmatter image references
 */

import matter from 'gray-matter';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

if (!process.env.VAULT_DIR) {
    console.error('ERROR: VAULT_DIR environment variable is not set.');
    console.error('Set it in .env or export it in your shell. See .env.example.');
    process.exit(1);
}

const VAULT_DIR = process.env.VAULT_DIR.replace(/^~/, process.env.HOME);
const VAULT_PRINTS = join(VAULT_DIR, 'Prints');
const VAULT_PRINT_IMAGES = join(VAULT_DIR, 'assets', 'prints');
const VAULT_PAGE_IMAGES = join(VAULT_DIR, 'assets', 'pages');

const PROJECT_DIR = join(import.meta.dirname, '..');
const ASTRO_PRINTS = join(PROJECT_DIR, 'src', 'content', 'prints');
const ASTRO_PRINT_IMAGES = join(PROJECT_DIR, 'src', 'assets', 'prints');

// Ensure output directories exist
mkdirSync(ASTRO_PRINTS, { recursive: true });
mkdirSync(ASTRO_PRINT_IMAGES, { recursive: true });

// --- Build cross-reference map from vault notes: vaultFilename → id ---
const wikiLinkMap = new Map(); // "07 - A Cloudy Day in Venice" → 7

const files = readdirSync(VAULT_PRINTS).filter(f => f.endsWith('.md'));

for (const file of files) {
    const raw = readFileSync(join(VAULT_PRINTS, file), 'utf-8');
    const { data } = matter(raw);
    const basename = file.replace(/\.md$/, '');
    wikiLinkMap.set(basename, data.id);
}

console.log(`Processing ${files.length} vault notes...\n`);

let errors = 0;

for (const file of files) {
    const raw = readFileSync(join(VAULT_PRINTS, file), 'utf-8');
    const { data, content } = matter(raw);

    // Validate required fields
    if (!data.id || !data.title || !data.slug) {
        console.error(`ERROR: Missing required field (id, title, or slug) in ${file}`);
        errors++;
        continue;
    }

    // --- Parse body sections ---
    const lines = content.split('\n');

    let currentSection = 'preamble'; // before any ## heading
    const sections = {
        preamble: [],
        publications: [],
        drawings: [],
        collections: [],
        notes: [],
    };

    const sectionMap = {
        '## publications': 'publications',
        '## related drawings': 'drawings',
        '## collections': 'collections',
        '## notes': 'notes',
    };

    for (const line of lines) {
        const lower = line.toLowerCase().trim();
        if (sectionMap[lower]) {
            currentSection = sectionMap[lower];
            continue;
        }
        sections[currentSection].push(line);
    }

    // --- Extract image info from preamble ---
    // Image is embedded in the body as ![[filename.jpg]], not in frontmatter.
    // Caption is the italic line (*text*) immediately following the embed.
    const preambleText = sections.preamble.join('\n').trim();
    let imageFilename = null;
    let imageCaption = null;
    let missingText = null;

    const embedMatch = preambleText.match(/^!\[\[([^\]]+)\]\]/m);
    if (embedMatch) {
        imageFilename = embedMatch[1];
        // Extract caption from italic line below the embed: *caption text*
        const captionMatch = preambleText.match(/^\*([^*]+)\*$/m);
        if (captionMatch) {
            imageCaption = captionMatch[1];
        }
    } else {
        // No image embed — preamble contains the missing-image text
        if (preambleText && preambleText !== 'No image available.') {
            missingText = preambleText;
        } else if (preambleText === 'No image available.') {
            missingText = 'No image available.';
        }
    }

    // --- Parse publications (markdown list items) ---
    const publications = [];
    for (const line of sections.publications) {
        const match = line.match(/^- (.+)$/);
        if (match) {
            publications.push(match[1]);
        }
    }

    // --- Parse drawings (markdown links in list items) ---
    const drawings = [];
    for (const line of sections.drawings) {
        const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\)$/);
        if (match) {
            drawings.push({ name: match[1], url: match[2] });
        }
    }

    // --- Parse collections/museums (markdown links in list items) ---
    const museums = [];
    for (const line of sections.collections) {
        const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\)$/);
        if (match) {
            museums.push({ name: match[1], url: match[2] });
        }
    }

    // --- Parse notes body ---
    let notesBody = sections.notes.join('\n').trim();

    // Convert Obsidian wikilinks back to anchor cross-references
    // [[07 - A Cloudy Day in Venice|A Cloudy Day in Venice]] → [A Cloudy Day in Venice](#7)
    notesBody = notesBody.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (match, target, displayText) => {
        const id = wikiLinkMap.get(target);
        if (id !== undefined) {
            return `[${displayText}](#${id})`;
        }
        console.warn(`  WARNING: Wikilink target "${target}" not found in ${file}`);
        return match;
    });

    // Also handle wikilinks without display text: [[07 - A Cloudy Day in Venice]]
    notesBody = notesBody.replace(/\[\[([^\]|]+)\]\]/g, (match, target) => {
        const id = wikiLinkMap.get(target);
        if (id !== undefined) {
            // Use the title part (after "XX - ")
            const title = target.replace(/^\d+ - /, '');
            return `[${title}](#${id})`;
        }
        console.warn(`  WARNING: Wikilink target "${target}" not found in ${file}`);
        return match;
    });

    // --- Build nested Astro frontmatter ---
    const astroFm = {
        id: data.id,
        title: data.title,
        image: {
            filename: imageFilename || null,
            caption: imageCaption || null,
            missing_text: missingText || null,
        },
        year: data.year,
        size: {
            dimensions: data.dimensions || null,
            source: data.dimensions_source || null,
            source_url: data.dimensions_source_url || null,
        },
        signed: data.signed || null,
        publications,
        drawings,
        museums,
        complete: data.complete,
    };

    // --- Serialize YAML frontmatter ---
    // gray-matter's stringify has some quirks with nulls and arrays, so build manually
    const yamlLines = [];
    yamlLines.push('---');
    yamlLines.push(`id: ${astroFm.id}`);
    yamlLines.push(`title: ${yamlQuote(astroFm.title)}`);
    yamlLines.push(`image:`);
    yamlLines.push(`    filename: ${astroFm.image.filename || ''}`);
    yamlLines.push(`    caption: ${astroFm.image.caption ? yamlQuote(astroFm.image.caption) : ''}`);
    yamlLines.push(`    missing_text: ${astroFm.image.missing_text ? yamlQuote(astroFm.image.missing_text) : ''}`);
    yamlLines.push(`year: "${astroFm.year}"`);
    yamlLines.push(`size:`);
    yamlLines.push(`    dimensions: ${astroFm.size.dimensions ? yamlQuote(astroFm.size.dimensions) : ''}`);
    yamlLines.push(`    source: ${astroFm.size.source ? yamlQuote(astroFm.size.source) : ''}`);
    yamlLines.push(`    source_url: ${astroFm.size.source_url || ''}`);
    yamlLines.push(`signed: ${astroFm.signed ? yamlQuote(astroFm.signed) : ''}`);

    // Publications array
    if (astroFm.publications.length === 0) {
        yamlLines.push(`publications: []`);
    } else {
        yamlLines.push(`publications:`);
        for (const p of astroFm.publications) {
            yamlLines.push(`    - ${yamlQuote(p)}`);
        }
    }

    // Drawings array
    if (astroFm.drawings.length === 0) {
        yamlLines.push(`drawings: []`);
    } else {
        yamlLines.push(`drawings:`);
        for (const d of astroFm.drawings) {
            yamlLines.push(`    -   name: ${d.name}`);
            yamlLines.push(`        url: ${d.url}`);
        }
    }

    // Museums array
    if (astroFm.museums.length === 0) {
        yamlLines.push(`museums: []`);
    } else {
        yamlLines.push(`museums: `);
        for (const m of astroFm.museums) {
            yamlLines.push(`    -   name: ${yamlQuote(m.name)}`);
            yamlLines.push(`        url: ${m.url}`);
        }
    }

    yamlLines.push(`complete: ${astroFm.complete ? 'True' : 'False'}`);
    yamlLines.push('---');

    // --- Build output ---
    const output = yamlLines.join('\n') + '\n' + notesBody + '\n';

    // Write using the original slug filename
    const outPath = join(ASTRO_PRINTS, `${data.slug}.md`);
    writeFileSync(outPath, output, 'utf-8');
    console.log(`  ${data.slug}.md`);
}

// --- Process pages ---
console.log('\nProcessing pages...');

const VAULT_PAGES = join(VAULT_DIR, 'Pages');
const ASTRO_PAGES = join(PROJECT_DIR, 'src', 'content', 'pages');
mkdirSync(ASTRO_PAGES, { recursive: true });

/**
 * Convert wikilinks in page content to anchor links.
 * [[02 - Old Mill, East Hampton, Long Island|#2 Old Mill, East Hampton, Long Island]]
 * → [#2 Old Mill, East Hampton, Long Island](/#2)
 */
function convertPageWikilinks(text) {
    // Process wikilinks line by line to avoid cross-contamination between links.
    return text.split('\n').map(line => {
        // First pass: handle wikilinks with brackets in note names.
        // These produce ]]] at the end — match the longer pattern first.
        // Pattern: [[...name]|...display]]] where the note name ends with ]
        let processed = line.replace(/\[\[(.+?)\]\|(.+?)\]\]\]/g, (match, targetBase, displayBase) => {
            const target = targetBase + ']';
            const displayText = displayBase + ']';
            const id = wikiLinkMap.get(target);
            if (id !== undefined) {
                const escaped = displayText.replace(/\[/g, '&#91;').replace(/\]/g, '&#93;');
                return `[${escaped}](/#${id})`;
            }
            return match;
        });

        // Second pass: standard wikilinks (non-greedy match)
        processed = processed.replace(/\[\[(.+?)\|(.+?)\]\]/g, (match, target, displayText) => {
            const id = wikiLinkMap.get(target);
            if (id !== undefined) {
                const escaped = displayText.replace(/\[/g, '&#91;').replace(/\]/g, '&#93;');
                return `[${escaped}](/#${id})`;
            }
            return match;
        });

        // Handle wikilinks without display text
        processed = processed.replace(/\[\[(.+?)\]\]/g, (match, target) => {
            const id = wikiLinkMap.get(target);
            if (id !== undefined) {
                const title = target.replace(/^\d+ - /, '');
                const escaped = title.replace(/\[/g, '&#91;').replace(/\]/g, '&#93;');
                return `[${escaped}](/#${id})`;
            }
            return match;
        });

        return processed;
    }).join('\n');
}

/**
 * Convert biography figure blocks from vault convention to styled HTML.
 * 
 * Input (vault):
 *   <figure data-layout="float-right">
 *   ![[image.jpg]]
 *   *caption text*
 *   </figure>
 * 
 * Output (Astro-ready HTML):
 *   <figure class="block md:w-1/5 md:float-right md:pl-4 pb-4">
 *   <img src="/assets/pages/image.jpg" alt="" />
 *   <figcaption class="text-sm text-center italic pt-1">caption text</figcaption>
 *   </figure>
 */
function convertBiographyFigures(text) {
    // Match <figure> or <figure data-layout="..."> blocks
    return text.replace(
        /<figure(?:\s+data-layout="([^"]*)")?>\s*\n\s*!\[\[([^\]]+)\]\]\s*\n\s*\*([^*]+)\*\s*\n\s*<\/figure>/g,
        (_match, layout, imageFile, caption) => {
            let figureClass;
            if (layout === 'float-right') {
                figureClass = 'block md:w-1/5 md:float-right md:pl-4 pb-4';
            } else {
                // Default: centered figure (wrapped in a flex container)
                return `<div class="flex justify-center">\n<figure class="block pt-4 pb-8 md:w-4/5">\n<img src="/assets/pages/${imageFile}" alt="" />\n<figcaption class="text-sm text-center italic pt-1">${caption}</figcaption>\n</figure>\n</div>`;
            }
            return `<figure class="${figureClass}">\n<img src="/assets/pages/${imageFile}" alt="" />\n<figcaption class="text-sm text-center italic pt-1">${caption}</figcaption>\n</figure>`;
        }
    );
}

if (existsSync(VAULT_PAGES)) {
    const pageFiles = readdirSync(VAULT_PAGES).filter(f => f.endsWith('.md'));
    
    for (const pageFile of pageFiles) {
        const raw = readFileSync(join(VAULT_PAGES, pageFile), 'utf-8');
        const { data, content } = matter(raw);
        
        let processed = content;
        
        // Convert figure blocks first (biography) — must run before wikilink
        // conversion so ![[image]] embeds inside figures are handled correctly
        processed = convertBiographyFigures(processed);
        
        // Convert wikilinks
        processed = convertPageWikilinks(processed);
        
        // Write with frontmatter preserved
        const output = matter.stringify(processed, data);
        const slug = pageFile.replace(/\.md$/, '').toLowerCase();
        const outPath = join(ASTRO_PAGES, `${slug}.md`);
        writeFileSync(outPath, output, 'utf-8');
        console.log(`  ${slug}.md`);
    }
}

// --- Copy images ---
console.log('\nCopying images...');

let imageCount = 0;

if (existsSync(VAULT_PRINT_IMAGES)) {
    for (const img of readdirSync(VAULT_PRINT_IMAGES)) {
        copyFileSync(join(VAULT_PRINT_IMAGES, img), join(ASTRO_PRINT_IMAGES, img));
        imageCount++;
    }
}

if (existsSync(VAULT_PAGE_IMAGES)) {
    const publicPageImages = join(PROJECT_DIR, 'public', 'assets', 'pages');
    mkdirSync(publicPageImages, { recursive: true });
    for (const img of readdirSync(VAULT_PAGE_IMAGES)) {
        copyFileSync(join(VAULT_PAGE_IMAGES, img), join(publicPageImages, img));
        imageCount++;
    }
}

console.log(`Copied ${imageCount} images.`);

if (errors > 0) {
    console.error(`\n${errors} error(s) encountered.`);
    process.exit(1);
}

console.log(`\nDone. Converted ${files.length} vault notes to Astro format.`);

// --- Helpers ---

/**
 * Quote a YAML string value if it contains special characters.
 */
function yamlQuote(str) {
    if (!str) return '';
    // Quote if contains colons, brackets, quotes, or starts with special chars
    if (/[:#\[\]{}|>*&!%@`"']/.test(str) || str.startsWith('- ') || str.startsWith('? ')) {
        // Use double quotes, escaping internal double quotes
        return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return str;
}
