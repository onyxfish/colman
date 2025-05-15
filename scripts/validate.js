#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const printsDir = 'src/content/prints';

function run() {
    const ids = [];

    fs.readdirSync(printsDir).forEach((filename) => {
        const filePath = path.join(printsDir, filename);
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const data = matter(fileContents)['data'];

        if (data.complete === false) {
            console.log(`Incomplete print: #${data.id} ${filename}`)
        }

        if (ids.includes(data.id)) {
            console.log(`Duplicate id: #${data.id} in ${filename}`);
        }

        ids.push(data.id);
    });

    for (let i = 1; i < ids.length; i++) {
        if (!ids.includes(i)) {
            console.log(`Missing id: ${i}`);
        }
    }

    console.log(`Next id: #${Math.max(...ids) + 1}`)
}

run();
