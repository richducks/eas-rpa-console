const storageKey='eas-rpa-review-issues-v1';
const frame=document.querySelector('#rpa-preview');
const layer=document.querySelector('#badge-layer');
const dialog=document.querySelector('#issue-dialog');
let issues=[];let marking=false;let pending=null;
try{issues=JSON.parse(localStorage.getItem(storageKey))||[]}catch{issues=[]}
const selectorFor=el=>{if(el.id)return `#${el.id}`;const parts=[];for(let node=el;node&&node.nodeType===1&&parts.length<4;node=node.parentElement){let part=node.tagName.toLowerCase();if(node.classList.length)part+='.'+[...node.classList].slice(0,2).join('.');parts.unshift(part)}return parts.join(' > ')};
function persist(){localStorage.setItem(storageKey,JSON.stringify(issues));render()}
function render(){document.querySelector('#issue-count').textContent=issues.length;document.querySelector('#issue-list').innerHTML=issues.length?issues.map((x,i)=>`<article class="issue" data-priority="${x.priority}"><span class="number">${i+1}</span><div><strong>${escapeHtml(x.text)}</strong><small>${escapeHtml(x.selector)}</small></div><button data-remove="${x.id}" title="删除">×</button></article>`).join(''):'<div class="empty">尚未标记问题</div>';document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{issues=issues.filter(x=>x.id!==b.dataset.remove);persist()});renderBadges()}
function renderBadges(){layer.innerHTML='';const doc=frame.contentDocument;if(!doc)return;issues.forEach((x,i)=>{const el=doc.querySelector(x.selector);if(!el)return;const r=el.getBoundingClientRect();const badge=document.createElement('button');badge.className='badge';badge.textContent=i+1;badge.title=x.text;badge.style.left=`${r.left+r.width/2}px`;badge.style.top=`${r.top+r.height/2}px`;badge.onclick=()=>el.scrollIntoView({block:'center'});layer.appendChild(badge)})}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function attach(){const doc=frame.contentDocument;if(!doc)return;doc.addEventListener('click',event=>{if(!marking)return;event.preventDefault();event.stopPropagation();const el=event.target;pending={selector:selectorFor(el),label:(el.innerText||el.getAttribute('aria-label')||el.title||el.tagName).trim().slice(0,120)};document.querySelector('#target-summary').textContent=`目标：${pending.selector}${pending.label?` · ${pending.label}`:''}`;document.querySelector('#issue-text').value='';dialog.showModal();setTimeout(()=>document.querySelector('#issue-text').focus(),0)},true);doc.addEventListener('scroll',renderBadges,true);renderBadges()}
frame.addEventListener('load',attach);window.addEventListener('resize',renderBadges);
document.querySelector('#mark-toggle').onclick=event=>{marking=!marking;document.body.classList.toggle('marking',marking);event.currentTarget.classList.toggle('active',marking);event.currentTarget.textContent=marking?'停止标记':'开始标记';document.querySelector('#hint').textContent=marking?'标记已开启：点击右侧任意问题位置。':'开启标记后，点击右侧界面中的问题位置。'};
document.querySelector('#issue-form').addEventListener('submit',event=>{if(event.submitter?.value==='cancel'||!pending)return;event.preventDefault();const text=document.querySelector('#issue-text').value.trim();if(!text)return;issues.push({id:crypto.randomUUID(),text,priority:document.querySelector('#issue-priority').value,selector:pending.selector,label:pending.label,createdAt:new Date().toISOString()});pending=null;dialog.close();persist()});
document.querySelector('#clear-all').onclick=()=>{if(confirm('清空全部问题标记？')){issues=[];persist()}};
const payload=()=>JSON.stringify({title:'EAS RPA 网页问题标记',exportedAt:new Date().toISOString(),issues},null,2);
document.querySelector('#copy-json').onclick=async()=>{await navigator.clipboard.writeText(payload());document.querySelector('#hint').textContent='问题 JSON 已复制'};
document.querySelector('#download-json').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([payload()],{type:'application/json'}));a.download='eas-rpa-issues.json';a.click();URL.revokeObjectURL(a.href)};
document.querySelector('#reload-preview').onclick=()=>frame.contentWindow.location.reload();
render();
