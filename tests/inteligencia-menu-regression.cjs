'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('static/index.html','utf8');
const core=fs.readFileSync('static/cti-app-v31.js','utf8');
const side=html.match(/<aside class="side" id="side">([\s\S]*?)<\/aside>/);
const tabs=html.match(/<nav class="tabs" id="tabs">([\s\S]*?)<\/nav>/);
const sheet=html.match(/<div class="sheet" id="sheet">([\s\S]*?)<\/div><\/div>/);
assert.ok(side&&tabs&&sheet,'navigation regions must exist');
for(const [region,name] of [[side[1],'desktop sidebar'],[tabs[1],'desktop top bar'],[sheet[1],'mobile more menu']]){
 const matches=region.match(/data-(?:v|go)="inteligencia"/g)||[];
 assert.equal(matches.length,1,name+' must contain one exam intelligence item');
}
assert.equal((html.match(/id="view-inteligencia"/g)||[]).length,1,'unique exam intelligence view');
assert.ok(/const ROTAS = new Set\(\[[^\n]*'inteligencia'/.test(core),'route must exist');
assert.ok(core.includes("if (v === 'inteligencia') window.CTI_INTELIGENCIA?.refresh?.()"),'route must refresh module');
const sidebarLabels=[...side[1].matchAll(/<button data-v="([^"]+)"/g)].map(x=>x[1]);
assert.ok(sidebarLabels.indexOf('desempenho')+1===sidebarLabels.indexOf('inteligencia'),'intelligence must follow performance');
assert.ok(sidebarLabels.indexOf('inteligencia')+1===sidebarLabels.indexOf('cera'),'CERA must remain next to intelligence');
console.log('PASS all 3 navigation surfaces, unique route, existing menu order');
