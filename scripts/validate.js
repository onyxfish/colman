#!/usr/bin/env node

/**
 * Validates the Obsidian vault content for the Colman etchings catalogue.
 * 
 * Reads from: $VAULT_DIR (set in .env or environment)
 * Checks:
 *   - Referenced images exist
 *   - No duplicate IDs
 *   - No leftover TK placeholders
 *   - No missing sequential IDs
 *   - Incomplete entries are flagged
 *   - Required frontmatter fields are present
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

if (!process.env.VAULT_DIR) {
    console.error('ERROR: VAULT_DIR environment variable is not set.');
    console.error('Set it in .env or export it in your shell. See .env.example.');
    process.exit(1);
}

const vaultDir = process.env.VAULT_DIR.replace(/^~/, process.env.HOME);
const printsDir = path.join(vaultDir, 'Prints');
const imagesDir = path.join(vaultDir, 'assets', 'prints');

function run() {
    if (!fs.existsSync(printsDir)) {
        console.error(`Vault prints directory not found: ${printsDir}`);
        process.exit(1);
    }

    const ids = [];
    let errorCount = 0;

    const files = fs.readdirSync(printsDir).filter(f => f.endsWith('.md'));

    for (const filename of files) {
        const filePath = path.join(printsDir, filename);
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const { data } = matter(fileContents);

        // Check required fields
        if (!data.id) {
            console.log(`Missing id: ${filename}`);
            errorCount++;
        }

        if (!data.title) {
            console.log(`Missing title: ${filename}`);
            errorCount++;
        }

        if (!data.slug) {
            console.log(`Missing slug: ${filename}`);
            errorCount++;
        }

        // Check image exists (extracted from ![[filename]] embed in body)
        const embedMatch = fileContents.match(/!\[\[([^\]]+)\]\]/);
        if (embedMatch) {
            const imageFile = embedMatch[1];
            const imagePath = path.join(imagesDir, imageFile);

            if (!fs.existsSync(imagePath)) {
                console.log(`Invalid image: #${data.id} ${imageFile}`);
                errorCount++;
            }
        }

        // Flag incomplete entries
        if (data.complete === false) {
            console.log(`Incomplete: #${data.id} ${filename}`);
        }

        // Check for duplicate IDs
        if (ids.includes(data.id)) {
            console.log(`Duplicate id: #${data.id} in ${filename}`);
            errorCount++;
        }

        // Check for TK placeholders
        if (fileContents.toLowerCase().includes("tk")) {
            console.log(`TK: #${data.id} in ${filename}`);
        }

        ids.push(data.id);
    }

    // Check for missing sequential IDs
    const maxId = Math.max(...ids);
    for (let i = 1; i <= maxId; i++) {
        if (!ids.includes(i)) {
            console.log(`Missing id: ${i}`);
        }
    }

    console.log(`\nValidated ${files.length} prints.`);
    console.log(`Next id: #${maxId + 1}`);

    if (errorCount > 0) {
        console.error(`${errorCount} error(s) found.`);
        process.exit(1);
    }
}

run();
