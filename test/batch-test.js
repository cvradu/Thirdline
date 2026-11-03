require('../src/presets.js'); require('../src/batch.js');
const csv = '﻿Name;Role\r\n"Popescu, Alexandra";Head of Product\n"Ion ""Johnny"" Pop";"Editor\nNight shift"\n\nAna;\n';
const { headers, rows } = Batch.parseCSV(csv);
console.log(headers, JSON.stringify(rows));
const s = Presets.defaultState(); s.layers = { tag: Presets.newLayer('text', { name: 'Tag' }) };
const fields = Batch.textFields(s), map = Batch.autoMap(fields, headers);
console.log(map, Batch.fillRow(s, fields, map, rows[1]).subtitle.text, Batch.fileNames(rows, map, fields));
