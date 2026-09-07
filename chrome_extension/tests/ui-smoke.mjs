// Isolated UI checks. Uses a disposable, headless Edge instance on port 9333.
// No real extension storage, credentials, or AI requests are used.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.preview');
await mkdir(output, { recursive: true });
const fixture = `
window.__errors = [];
window.addEventListener('error', e => window.__errors.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));
const sampleNotes = [
 ['yutorah_101_notes', 'The art of paying attention', '## A more intentional life\\nThe shiur explores how small, deliberate choices shape our daily avodas Hashem.\\n\\n### Key ideas\\n- Attention is the beginning of connection.\\n- Make space for reflection before action.\\n- Bring intention into everyday moments.'],
 ['yutorah_102_transcript', 'Finding meaning in the everyday', '## Opening thoughts\\nToday we will explore the relationship between ordinary routines and a life of purpose. The familiar can become meaningful when we learn to see it with fresh eyes.'],
 ['yutorah_103_maamar', 'על התורה ועל העבודה', '# על התורה ועל העבודה\\nלימוד התורה הוא יסוד חיי האדם. מתוך העיון וההתבוננות זוכה האדם להבין את דרכו בעבודת השם.\\n\\n## עיקרי הדברים\\n- קביעות בלימוד התורה בכל יום\\n- חיבור בין הלימוד לחיי המעשה'],
 ['upload_learning_notes', 'Preparing for a new beginning', '## Return and renewal\\nA collection of thoughts on teshuvah, growth, and the possibility of beginning again. Each step forward matters, even when the path is not yet clear.'],
 ['yutorah_105_notes', 'The language of tefillah', '## Words that open a door\\nPrayer invites us to slow down and consider what we truly need. Understanding the structure of tefillah brings a new dimension to familiar words.'],
 ['yutorah_106_transcript', 'Learning together, growing together', '## The power of a chavrusa\\nLearning in partnership asks us to articulate an idea, listen carefully, and make room for another perspective. The conversation becomes part of the learning.']
];
window.__data = {api_key_mode:'custom',gemini_api_key:'test-only-placeholder'};
if (!location.search.includes('empty')) sampleNotes.forEach(([key,title,content],index) => Object.assign(__data, {[key]:content,[key+'_title']:title,[key+'_timestamp']:1788660000000-index*86400000}));
window.__jobs = location.search.includes('empty') ? [] : [
 {id:'sample',status:'running',createdAt:1788660000000,options:{filename:'Elul · A time for reflection',type:'notes',formats:{docx:true}},items:[{status:'complete'},{status:'processing',title:'Making room for change'},{status:'pending'}],logs:[{time:1788660000000,message:'Queue started. Preparing 3 shiurim.'}]},
 {id:'finished',status:'complete',createdAt:1788500000000,options:{filename:'Parsha perspectives',type:'maamar'},items:[{status:'complete'},{status:'complete'}],logs:[]}
];
window.chrome = {storage:{local:{
 get(keys,callback){const data=keys==null?{...__data}:Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in __data).map(k=>[k,__data[k]])); callback?.(data); return Promise.resolve(data);},
 set(data,callback){Object.assign(__data,data);callback?.();return Promise.resolve();},
 remove(keys,callback){(Array.isArray(keys)?keys:[keys]).forEach(k=>delete __data[k]);callback?.();},
 getBytesInUse(keys,callback){callback(6400);}
}},runtime:{lastError:null,getManifest:()=>({version:'5.1.6'}),getURL:path=>location.origin+'/'+path,openOptionsPage(){location.href='/options.html';},
 sendMessage(message,callback){
 if(message.action==='bulkPause') __jobs[0].status='paused';
 if(message.action==='bulkResume') __jobs[0].status='running';
 callback?.({success:true,jobs:__jobs});
 }},tabs:{create({url}){window.__openedUrl=url;}}};
window.fetch = () => Promise.reject(new Error('External requests disabled in UI test'));
window.alert = message => {window.__lastAlert=message;};
window.confirm = () => false;
`;
const server = createServer(async (req, res) => {
    try {
        const path = new URL(req.url, 'http://127.0.0.1').pathname;
        if (path === '/injected.html') {
            const source = await readFile(resolve(root, 'bulk-search.js'), 'utf8');
            const panel = source.match(/panel.innerHTML = `([\s\S]*?)`;/)[1];
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<html><head><script src="/fixture.js"></script><link rel="stylesheet" href="/button-style.css"><link rel="stylesheet" href="/bulk-search.css"></head><body data-page="test"><main><h1>Example lesson page</h1><p>Isolated visual fixture for the extension controls.</p></main><aside id="yutorah-bulk-panel" class="is-open">${panel}</aside><script src="/content.js"></script></body></html>`);
            return;
        }
        if (path === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fixture); return; }
        if (path === '/config.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('function hasDefaultKey(){return true;}'); return; }
        const file = resolve(root, '.' + path);
        if (!file.startsWith(root + '\\') || !['.html','.js','.css'].includes(extname(file))) { res.writeHead(404);res.end();return; }
        let text = await readFile(file, 'utf8');
        if (file.endsWith('.html')) text = text.replace('<head>', '<head><script src="/fixture.js"></script>');
        res.setHeader('Content-Type', {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css'}[extname(file)]);
        res.end(text);
    } catch { res.writeHead(404);res.end(); }
});
await new Promise(r => server.listen(8765, '127.0.0.1', r));
const target = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => socket.addEventListener('open', r, {once:true}));
let serial = 0;
const pending = new Map();
socket.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (message.id) { const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(message.error):item.resolve(message.result); }
});
function cdp(method, params={}) {return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function run(expression) {const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.text+JSON.stringify(r.exceptionDetails.exception)); return r.result.value;}
async function ready(expression) {for(let i=0;i<60;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression);}
async function visit(path, width=1440, height=1000) {
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await cdp('Page.navigate',{url:'http://127.0.0.1:8765/'+path});
    await ready('document.readyState === "complete" && !!document.body.dataset.page');
}
async function click(selector) {await run(`document.querySelector(${JSON.stringify(selector)}).click()`);}
async function screenshot(name) {const {data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve(output,name+'.png'),Buffer.from(data,'base64'));}
async function clean(name) {
    assert.deepEqual(await run('__errors'), [], name+' JS errors');
    assert.equal(await run('[...document.body.querySelectorAll("*")].every(el => el.getBoundingClientRect().right <= innerWidth + 1)'),true,name+' horizontal overflow');
    console.log('PASS '+name);
}
await cdp('Page.enable');
try {
    await visit('viewer.html');
    await ready('document.querySelectorAll(".note-card").length === 6');
    assert.equal(await run('document.getElementById("libraryTotal").textContent'),'6');
    await screenshot('library');
    await click('[data-filter="transcript"]');
    assert.equal(await run('[...document.querySelectorAll(".note-card")].filter(c=>c.style.display!=="none").length'),2);
    await run('document.getElementById("searchInput").value="no matching title";document.getElementById("searchInput").dispatchEvent(new Event("input"))');
    assert.equal(await run('document.getElementById("noResults").hidden'),false);
    await click('#resetFilters');
    await run('document.getElementById("sortNotes").value="oldest";document.getElementById("sortNotes").dispatchEvent(new Event("change"))');
    assert.equal(await run('document.querySelector(".note-card").dataset.key'),'yutorah_106_transcript');
    await click('[data-filter="transcript"]');
    await click('#selectAllBtn');
    assert.equal(await run('document.querySelectorAll(".note-select-checkbox:checked").length'),2);
    await click('#mergeExportBtn');
    await ready('!!document.activeElement.closest("#mergePanelModal")');
    assert.equal(await run('document.querySelector(".merge-item").dataset.key'),'yutorah_106_transcript');
    await click('.merge-item [data-move="down"]');
    assert.equal(await run('document.querySelector(".merge-item").dataset.key'),'yutorah_102_transcript');
    await screenshot('merge-dialog');
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await run('document.getElementById("mergePanelModal").style.display'),'none');
    await clean('library filters, sorting, selection and dialog');
    await visit('viewer.html?empty');await ready('document.getElementById("allNotesView").style.display === "block"');await screenshot('empty-library');await clean('empty library');
    await visit('viewer.html?key=yutorah_103_maamar');await ready('document.getElementById("singleNoteView").style.display === "block"');
    assert.equal(await run('document.getElementById("noteContent").dir'),'rtl');await screenshot('hebrew-note');await clean('Hebrew reading view');
    await visit('viewer.html?key=yutorah_102_transcript');await ready('document.getElementById("singleNoteView").style.display === "block"');await screenshot('transcript');await clean('transcript refinements');
    await visit('upload.html');await screenshot('upload');await clean('upload landing');
    await run('const transfer=new DataTransfer();transfer.items.add(new File(["sample"],"sample.txt",{type:"text/plain"}));document.getElementById("fileInput").files=transfer.files;document.getElementById("fileInput").dispatchEvent(new Event("change"));');
    await ready('document.getElementById("fileInfo").style.display === "block"');
    assert.equal(await run('document.getElementById("ocrOption").style.display'),'block');await screenshot('upload-selected');
    await click('#removeFileBtn');assert.equal(await run('document.getElementById("fileInfo").style.display'),'none');await clean('file selection and removal');
    await visit('options.html');await ready('document.getElementById("modeCustom").checked');await screenshot('settings');
    await click('#toggleApiKey');assert.equal(await run('document.getElementById("apiKey").type'),'text');await click('#toggleApiKey');
    await click('#togglePrompts');assert.equal(await run('document.getElementById("promptsSection").style.display'),'block');
    await click('#modeDefault');assert.equal(await run('document.getElementById("customKeySection").style.display'),'none');await clean('settings controls');
    await visit('bulk-monitor.html');await ready('document.querySelectorAll(".job-card").length === 2');await screenshot('queue');
    await click('[data-action="bulkPause"]');await ready('!!document.querySelector("[data-action=bulkResume]")');
    await click('[data-action="bulkResume"]');await ready('!!document.querySelector("[data-action=bulkPause]")');await clean('queue pause and resume');
    await visit('bulk-monitor.html?empty');await ready('!!document.querySelector(".empty-state")');await clean('empty queue');
    await visit('sidebar.html',460,900);await run('initSidebar({type:"transcript",url:"https://www.yutorah.org/lectures/102"});showResults({content:__data.yutorah_102_transcript});');await screenshot('sidebar');await clean('sidebar results');
    await visit('injected.html');await ready('document.querySelectorAll(".yutorah-action-btn").length === 3');await screenshot('injected-controls');await clean('injected buttons and bulk panel styling');
    await visit('popup.html',440,600);await screenshot('popup');assert.equal(await run('document.querySelector(".popup-tip")'),null,'Learning online tip removed');assert.equal(await run('document.querySelector(".web-action").href'),'https://shiurnotes.com/');await click('#viewNotes');assert.equal(await run('__openedUrl'),'http://127.0.0.1:8765/viewer.html');assert.equal(await run('document.documentElement.scrollHeight <= 600'),true,'Popup fits Chrome height');await clean('popup navigation and website link');
    for (const page of ['viewer.html','upload.html','options.html','bulk-monitor.html']) {await visit(page,390,844);await screenshot('mobile-'+page.split('.')[0]);await clean(page+' at 390px');}
    console.log('All UI smoke checks passed. Screenshots: .preview/');
} finally {
    socket.close();server.close();
}
