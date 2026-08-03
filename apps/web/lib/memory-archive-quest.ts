export const MEMORY_ARCHIVE_QUEST_STYLE = String.raw`<style id="heather-memory-quest-style">
#heatherQuestApp {
  --hq-bg-0: #0e0f1c;
  --hq-bg-1: #15172a;
  --hq-panel: #1b1e35;
  --hq-border: #2c2f52;
  --hq-gold: #e8c468;
  --hq-gold-dim: #a98a4a;
  --hq-teal: #5fd3c4;
  --hq-text: #eef0f7;
  --hq-muted: #8b8fae;
  --hq-stamp: #e2495a;
  position: fixed;
  inset: 0;
  z-index: 2147482000;
  display: none;
  overflow: hidden;
  background:
    radial-gradient(circle at 15% 0%, rgba(232,196,104,.10), transparent 45%),
    radial-gradient(circle at 85% 10%, rgba(95,211,196,.09), transparent 40%),
    var(--hq-bg-0);
  color: var(--hq-text);
  font-family: "Noto Sans KR", system-ui, sans-serif;
}
#heatherQuestApp.hq-open { display: flex; flex-direction: column; }
#heatherQuestApp * { box-sizing: border-box; }
.hq-shell-topbar {
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  padding: 12px clamp(18px, 4vw, 64px);
  background: rgba(10,12,23,.88);
  backdrop-filter: blur(20px);
}
.hq-shell-brand { display: flex; min-width: 0; align-items: center; gap: 12px; }
.hq-shell-emblem {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid rgba(232,196,104,.38);
  border-radius: 13px;
  background: rgba(232,196,104,.09);
  color: var(--hq-gold);
  font-size: 21px;
}
.hq-shell-brand strong { display: block; font-size: 16px; }
.hq-shell-brand span { display: block; margin-top: 2px; color: var(--hq-muted); font-size: 11px; }
.hq-shell-nav { display: flex; align-items: center; gap: 6px; }
.hq-shell-nav button {
  min-height: 38px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--hq-muted);
  padding: 0 15px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.hq-shell-nav button:hover { background: rgba(255,255,255,.05); color: var(--hq-text); }
.hq-shell-nav button.hq-active {
  border-color: rgba(232,196,104,.35);
  background: rgba(232,196,104,.10);
  color: var(--hq-gold);
}
.hq-scroll { flex: 1; min-height: 0; overflow: auto; padding: 34px 18px 64px; }
.hq-wrap { width: min(100%, 920px); margin: 0 auto; }
.hq-header { text-align: center; margin-bottom: 24px; }
.hq-eyebrow { margin-bottom: 6px; color: var(--hq-gold-dim); font-size: 11px; font-weight: 700; letter-spacing: .3em; }
.hq-header h1 {
  margin: 0 0 5px;
  background: linear-gradient(180deg, #fff, var(--hq-gold) 140%);
  background-clip: text;
  color: transparent;
  font-size: clamp(30px, 5vw, 46px);
  font-weight: 900;
  letter-spacing: -1px;
}
.hq-sub { color: var(--hq-muted); font-size: 13px; }
.hq-status {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 18px;
  border: 1px solid var(--hq-border);
  border-radius: 18px;
  background: rgba(27,30,53,.94);
  padding: 20px 22px;
  box-shadow: 0 18px 55px rgba(0,0,0,.16);
}
.hq-badge {
  display: flex;
  width: 62px;
  height: 62px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff2, transparent 60%), linear-gradient(160deg, var(--hq-gold), #b5822f);
  box-shadow: 0 0 0 3px var(--hq-bg-1), 0 0 0 4px var(--hq-gold-dim);
  color: #221a08;
  font-size: 18px;
  font-weight: 900;
}
.hq-status-main { flex: 1; min-width: 0; }
.hq-status-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 9px; }
.hq-status-title { font-size: 15px; font-weight: 700; }
.hq-status-xp { color: var(--hq-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.hq-bar-track { height: 11px; overflow: hidden; border: 1px solid var(--hq-border); border-radius: 7px; background: var(--hq-bg-1); }
.hq-bar-fill { width: 0; height: 100%; border-radius: 7px; background: linear-gradient(90deg, var(--hq-gold-dim), var(--hq-gold)); transition: width .5s cubic-bezier(.4,1.4,.4,1); }
.hq-add-bar {
  display: flex;
  gap: 9px;
  margin-bottom: 18px;
  border: 1px solid var(--hq-border);
  border-radius: 15px;
  background: rgba(27,30,53,.94);
  padding: 11px;
}
.hq-add-bar input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--hq-border);
  border-radius: 10px;
  outline: none;
  background: var(--hq-bg-1);
  color: var(--hq-text);
  padding: 12px 14px;
  font: inherit;
  font-size: 14px;
}
.hq-add-bar input:focus { border-color: var(--hq-gold-dim); box-shadow: 0 0 0 3px rgba(232,196,104,.07); }
.hq-add-bar input::placeholder { color: var(--hq-muted); }
.hq-add-bar button {
  flex: 0 0 auto;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(160deg, var(--hq-gold), #b5822f);
  color: #221a08;
  padding: 0 22px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 800;
  cursor: pointer;
}
.hq-all-clear {
  margin-bottom: 18px;
  border: 1.5px dashed var(--hq-teal);
  border-radius: 14px;
  color: var(--hq-teal);
  padding: 14px;
  text-align: center;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 1px;
}
.hq-list { overflow: hidden; border: 1px solid var(--hq-border); border-radius: 18px; background: rgba(27,30,53,.94); }
.hq-quest { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--hq-border); padding: 15px 17px; }
.hq-quest:last-child { border-bottom: 0; }
.hq-check {
  display: flex;
  width: 25px;
  height: 25px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--hq-gold-dim);
  border-radius: 7px;
  background: var(--hq-bg-1);
  cursor: pointer;
  transition: all .15s ease;
}
.hq-check.hq-on { border-color: var(--hq-teal); background: linear-gradient(160deg, var(--hq-teal), #3aa89a); }
.hq-check svg { width: 14px; height: 14px; opacity: 0; transition: opacity .15s ease; }
.hq-check.hq-on svg { opacity: 1; }
.hq-quest-text { flex: 1; min-width: 0; font-size: 14.5px; line-height: 1.45; word-break: break-word; }
.hq-quest.hq-done .hq-quest-text { color: var(--hq-muted); text-decoration: line-through; text-decoration-color: var(--hq-muted); }
.hq-quest-xp { flex: 0 0 auto; color: var(--hq-gold-dim); font-size: 11px; font-weight: 800; }
.hq-photo-btn {
  display: flex;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px dashed var(--hq-border);
  border-radius: 8px;
  background: var(--hq-bg-1);
  color: var(--hq-muted);
  cursor: pointer;
}
.hq-photo-btn img { width: 100%; height: 100%; object-fit: cover; }
.hq-photo-btn svg { width: 14px; height: 14px; }
.hq-del-btn {
  display: flex;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--hq-muted);
  opacity: .55;
  cursor: pointer;
}
.hq-del-btn:hover { color: var(--hq-stamp); opacity: 1; }
.hq-del-btn svg { width: 14px; height: 14px; }
.hq-empty { padding: 42px 20px; color: var(--hq-muted); text-align: center; font-size: 13px; line-height: 1.7; }
.hq-reset-btn {
  display: block;
  margin: 17px auto 0;
  border: 1px solid var(--hq-border);
  border-radius: 20px;
  background: transparent;
  color: var(--hq-muted);
  padding: 8px 15px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.hq-reset-btn:hover { border-color: var(--hq-gold-dim); color: var(--hq-gold-dim); }
.hq-footer-note { margin-top: 20px; color: var(--hq-muted); text-align: center; font-size: 11.5px; line-height: 1.6; }
.hq-photo-modal {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(10,10,18,.9);
  padding: 20px;
}
.hq-photo-modal.hq-open { display: flex; }
.hq-photo-modal img { max-width: 100%; max-height: 80vh; border: 1px solid var(--hq-border); border-radius: 12px; }
.hq-modal-close {
  position: absolute;
  top: 22px;
  right: 22px;
  width: 38px;
  height: 38px;
  border: 1px solid var(--hq-border);
  border-radius: 50%;
  background: var(--hq-panel);
  color: var(--hq-text);
  cursor: pointer;
}
.hq-modal-remove {
  display: block;
  margin: 14px auto 0;
  border: 1px solid var(--hq-stamp);
  border-radius: 20px;
  background: transparent;
  color: var(--hq-stamp);
  padding: 8px 16px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
@media (max-width: 720px) {
  .hq-shell-topbar { align-items: flex-start; padding: 11px 13px; }
  .hq-shell-brand span { display: none; }
  .hq-shell-nav { gap: 2px; }
  .hq-shell-nav button { min-height: 36px; padding: 0 9px; font-size: 11.5px; }
  .hq-scroll { padding: 25px 12px 48px; }
  .hq-status { padding: 17px 16px; }
  .hq-badge { width: 52px; height: 52px; font-size: 16px; }
  .hq-add-bar { flex-direction: column; }
  .hq-add-bar button { min-height: 44px; }
  .hq-quest { gap: 9px; padding: 14px 12px; }
  .hq-quest-xp { display: none; }
}
</style>`;

export const MEMORY_ARCHIVE_QUEST_SCRIPT = String.raw`<script id="heather-memory-quest-script">
(function () {
  if (window.__heatherQuestReplacementInstalled) return;
  window.__heatherQuestReplacementInstalled = true;

  var DEFAULT_QUESTS = [
    {text:'브루클린 버거 먹기',xp:10},{text:'월드타워 영화관에서 영화보기',xp:10},{text:'무지 & 유니클로에서 옷 사주기',xp:15},
    {text:'반디앤루니스 코리안 굿즈 구경하기',xp:10},{text:'월드타워 전망대 가기',xp:15},{text:'교보문고 핫트랙스 구경하기',xp:10},
    {text:'애슐리 가기',xp:10},{text:'몽촌토성 산스장 가보기',xp:10},{text:'올림픽공원에서 피크닉하기',xp:15},
    {text:'강릉 카라반 캠핑 가기',xp:20},{text:'강릉에서 해변 산책하기',xp:10},{text:'밤에 고기 구워먹기',xp:15},
    {text:'해운대 가기',xp:15},{text:'광안리 가기',xp:15},{text:'서면 가기',xp:10},{text:'영도 가기',xp:10},
    {text:'제주시 가기',xp:10},{text:'서귀포시 가기',xp:10},{text:'애월 가기',xp:10},{text:'협재 해안도로 바이크 타기',xp:20},
    {text:'감귤 따기',xp:15},{text:'서울 남산타워 가기',xp:15},{text:'롯데월드 가기',xp:20},
    {text:'국립중앙박물관 가보기',xp:15},{text:'대명리조트 가기',xp:20}
  ];
  var STORAGE_KEY = 'quest-list-flat';
  var LEGACY_STORAGE_KEY = 'quest-data';
  var LEVEL_STEP = 40;
  var LEVEL_NAMES = ['신입 커플','썸타는 사이','열애 중','단짝 커플','베테랑 커플','환상의 짝꿍','전국구 커플','레벨 만렙','레전드 커플'];
  var quests = [];
  var photoCache = {};
  var activePhotoQuestId = null;
  var initialized = false;

  function uid(){ return 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
  function escapeHtml(value){ return String(value).replace(/[&<>"']/g,function(character){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]; }); }
  function normalizeText(value){ return String(value || '').replace(/\s+/g,' ').trim(); }

  async function storageGet(key){
    try {
      if (window.storage && typeof window.storage.get === 'function') {
        var result = await window.storage.get(key, false);
        return result && result.value ? result.value : null;
      }
    } catch (error) {}
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }
  async function storageSet(key,value){
    try {
      if (window.storage && typeof window.storage.set === 'function') {
        await window.storage.set(key, value, false);
        return;
      }
    } catch (error) {}
    try { window.localStorage.setItem(key, value); } catch (error) {}
  }
  async function storageDelete(key){
    try {
      if (window.storage && typeof window.storage.delete === 'function') {
        await window.storage.delete(key, false);
        return;
      }
    } catch (error) {}
    try { window.localStorage.removeItem(key); } catch (error) {}
  }

  function buildApp(){
    if (document.getElementById('heatherQuestApp')) return;
    var app = document.createElement('section');
    app.id = 'heatherQuestApp';
    app.setAttribute('aria-label','커플 퀘스트 로그');
    app.innerHTML =
      '<header class="hq-shell-topbar">' +
        '<div class="hq-shell-brand"><div class="hq-shell-emblem">✦</div><div><strong>추억 저장소</strong><span>사진과 일기로 나의 역사를 기록하는 공간</span></div></div>' +
        '<nav class="hq-shell-nav" aria-label="추억 저장소 이동">' +
          '<button type="button" data-hq-nav="타임라인">타임라인</button>' +
          '<button type="button" data-hq-nav="갤러리">갤러리</button>' +
          '<button type="button" class="hq-active" data-hq-nav="퀘스트">퀘스트</button>' +
        '</nav>' +
      '</header>' +
      '<div class="hq-scroll"><main class="hq-wrap">' +
        '<div class="hq-header"><div class="hq-eyebrow">COUPLE QUEST LOG</div><h1>우리 둘의 한국 정복기</h1><div class="hq-sub">체크·추가·사진 등록 모두 자동 저장돼요</div></div>' +
        '<section class="hq-status"><div class="hq-badge" id="hqLevelBadge">Lv.1</div><div class="hq-status-main"><div class="hq-status-row"><div class="hq-status-title" id="hqLevelTitle">신입 커플</div><div class="hq-status-xp" id="hqXpText">0 / 0 XP</div></div><div class="hq-bar-track"><div class="hq-bar-fill" id="hqBarFill"></div></div></div></section>' +
        '<div class="hq-add-bar"><input type="text" id="hqNewQuestInput" placeholder="예: 제주도에서 한라산 등반하기 (입력 후 Enter)"><button type="button" id="hqAddQuestBtn">추가</button></div>' +
        '<div id="hqAllClear" class="hq-all-clear" style="display:none">🎉 지금까지의 퀘스트를 전부 클리어했어요!</div>' +
        '<div class="hq-list" id="hqList"></div>' +
        '<button type="button" class="hq-reset-btn" id="hqResetBtn">체크 표시 초기화</button>' +
        '<div class="hq-footer-note">퀘스트를 입력하면 목록 맨 아래에 바로 추가돼요 · 카메라 아이콘으로 사진도 남겨보세요</div>' +
      '</main></div>' +
      '<div class="hq-photo-modal" id="hqPhotoModal"><button type="button" class="hq-modal-close" id="hqModalClose">✕</button><div style="text-align:center"><img id="hqModalImg" src="" alt="quest photo"><button type="button" class="hq-modal-remove" id="hqModalRemove">이 사진 삭제</button></div></div>' +
      '<input type="file" id="hqFileInput" accept="image/*" style="display:none">';
    document.body.appendChild(app);

    app.querySelectorAll('[data-hq-nav]').forEach(function(button){
      button.addEventListener('click',function(){
        var destination = button.getAttribute('data-hq-nav');
        if (destination === '퀘스트') return;
        closeQuestApp();
        clickOriginalTab(destination);
      });
    });
    document.getElementById('hqAddQuestBtn').addEventListener('click',function(){ addFromInput(); });
    document.getElementById('hqNewQuestInput').addEventListener('keydown',function(event){ if(event.key === 'Enter') addFromInput(); });
    document.getElementById('hqResetBtn').addEventListener('click',async function(){
      if(!window.confirm('모든 체크 표시를 초기화할까요? 등록한 퀘스트와 사진은 유지돼요.')) return;
      quests.forEach(function(quest){ quest.done = false; });
      await saveQuests(); render();
    });
    document.getElementById('hqFileInput').addEventListener('change',handlePhotoFile);
    document.getElementById('hqModalClose').addEventListener('click',closePhotoModal);
    document.getElementById('hqPhotoModal').addEventListener('click',function(event){ if(event.target.id === 'hqPhotoModal') closePhotoModal(); });
    document.getElementById('hqModalRemove').addEventListener('click',removeActivePhoto);
  }

  function originalTabs(){
    return Array.prototype.filter.call(document.querySelectorAll('button,a,[role="tab"],[data-tab]'),function(element){
      return !element.closest('#heatherQuestApp');
    });
  }
  function clickOriginalTab(label){
    var tab = originalTabs().find(function(element){ return normalizeText(element.textContent) === label; });
    if(tab) tab.click();
  }
  function openQuestApp(){
    buildApp();
    var app = document.getElementById('heatherQuestApp');
    app.classList.add('hq-open');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    if(!initialized){ initialized = true; void init(); }
    else render();
  }
  function closeQuestApp(){
    var app = document.getElementById('heatherQuestApp');
    if(app) app.classList.remove('hq-open');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  function totalXP(){ return quests.reduce(function(sum,quest){ return sum + Number(quest.xp || 0); },0); }
  function currentXP(){ return quests.reduce(function(sum,quest){ return sum + (quest.done ? Number(quest.xp || 0) : 0); },0); }
  function levelInfo(xp){ var level = Math.min(Math.floor(xp / LEVEL_STEP) + 1, LEVEL_NAMES.length); return {level:level,name:LEVEL_NAMES[level-1]}; }
  async function saveQuests(){ await storageSet(STORAGE_KEY,JSON.stringify(quests)); }

  function render(){
    var app = document.getElementById('heatherQuestApp');
    if(!app) return;
    var xp = currentXP();
    var total = totalXP();
    var info = levelInfo(xp);
    document.getElementById('hqLevelBadge').textContent = 'Lv.' + info.level;
    document.getElementById('hqLevelTitle').textContent = info.name;
    document.getElementById('hqXpText').textContent = xp + ' / ' + total + ' XP';
    document.getElementById('hqBarFill').style.width = (total ? Math.min(100,(xp/total)*100) : 0) + '%';
    document.getElementById('hqAllClear').style.display = quests.length && quests.every(function(quest){ return quest.done; }) ? 'block' : 'none';

    var list = document.getElementById('hqList');
    list.innerHTML = '';
    if(!quests.length){ list.innerHTML = '<div class="hq-empty">아직 등록된 퀘스트가 없어요.<br>위 입력창에 하고 싶은 걸 적고 Enter를 눌러보세요.</div>'; return; }
    quests.forEach(function(quest){
      var row = document.createElement('div');
      row.className = 'hq-quest' + (quest.done ? ' hq-done' : '');
      row.innerHTML =
        '<div class="hq-check ' + (quest.done ? 'hq-on' : '') + '"><svg viewBox="0 0 24 24" fill="none" stroke="#0e0f1c" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></div>' +
        '<div class="hq-quest-text">' + escapeHtml(quest.text) + '</div>' +
        '<div class="hq-quest-xp">+' + Number(quest.xp || 10) + '</div>' +
        '<div class="hq-photo-btn" title="사진 등록">' + (photoCache[quest.id] ? '<img src="' + photoCache[quest.id] + '">' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>') + '</div>' +
        '<button type="button" class="hq-del-btn" title="삭제"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
      row.querySelector('.hq-check').addEventListener('click',function(){ void toggleQuest(quest.id); });
      row.querySelector('.hq-photo-btn').addEventListener('click',function(){ openPhotoAction(quest.id); });
      row.querySelector('.hq-del-btn').addEventListener('click',function(){ void deleteQuest(quest.id); });
      list.appendChild(row);
      if(!(quest.id in photoCache)) void loadPhoto(quest.id);
    });
  }

  async function toggleQuest(id){ var quest = quests.find(function(item){ return item.id === id; }); if(!quest) return; quest.done = !quest.done; await saveQuests(); render(); }
  function addFromInput(){ var input = document.getElementById('hqNewQuestInput'); var value = input.value.trim(); if(!value) return; quests.push({id:uid(),text:value,xp:10,done:false}); input.value = ''; void saveQuests(); render(); input.focus(); }
  async function deleteQuest(id){ quests = quests.filter(function(quest){ return quest.id !== id; }); delete photoCache[id]; await saveQuests(); await storageDelete('quest-photo:' + id); render(); }
  async function loadPhoto(id){ photoCache[id] = null; var value = await storageGet('quest-photo:' + id); if(value){ photoCache[id] = value; render(); } }

  function openPhotoAction(id){
    activePhotoQuestId = id;
    if(photoCache[id]){
      document.getElementById('hqModalImg').src = photoCache[id];
      document.getElementById('hqPhotoModal').classList.add('hq-open');
    } else document.getElementById('hqFileInput').click();
  }
  function closePhotoModal(){ document.getElementById('hqPhotoModal').classList.remove('hq-open'); }
  async function removeActivePhoto(){ if(!activePhotoQuestId) return; photoCache[activePhotoQuestId] = null; closePhotoModal(); render(); await storageDelete('quest-photo:' + activePhotoQuestId); }
  function handlePhotoFile(event){
    var file = event.target.files && event.target.files[0];
    if(!file || !activePhotoQuestId) return;
    var reader = new FileReader();
    reader.onload = function(loadEvent){
      var image = new Image();
      image.onload = async function(){
        var maxDim = 640, width = image.width, height = image.height;
        if(width > height && width > maxDim){ height = Math.round(height * maxDim / width); width = maxDim; }
        else if(height > maxDim){ width = Math.round(width * maxDim / height); height = maxDim; }
        var canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(image,0,0,width,height);
        var dataUrl = canvas.toDataURL('image/jpeg',.7);
        var id = activePhotoQuestId;
        photoCache[id] = dataUrl; render(); await storageSet('quest-photo:' + id,dataUrl);
      };
      image.src = loadEvent.target.result;
    };
    reader.readAsDataURL(file); event.target.value = '';
  }

  async function init(){
    var saved = await storageGet(STORAGE_KEY);
    if(saved){
      try { quests = JSON.parse(saved); } catch(error) { quests = []; }
    }
    if(!quests.length){
      var migrated = null;
      var legacy = await storageGet(LEGACY_STORAGE_KEY);
      if(legacy){
        try {
          var chapters = JSON.parse(legacy);
          migrated = chapters.flatMap(function(chapter){ return chapter.quests.map(function(quest){ return {id:quest.id,text:quest.text,xp:quest.xp,done:!!quest.done}; }); });
        } catch(error) {}
      }
      quests = migrated && migrated.length ? migrated : DEFAULT_QUESTS.map(function(quest){ return {id:uid(),text:quest.text,xp:quest.xp,done:false}; });
      await saveQuests();
    }
    render();
  }

  document.addEventListener('click',function(event){
    var target = event.target && event.target.closest ? event.target.closest('button,a,[role="tab"],[data-tab]') : null;
    if(!target || target.closest('#heatherQuestApp')) return;
    if(normalizeText(target.textContent) === '퀘스트') window.setTimeout(openQuestApp,0);
  },true);

  function detectActiveQuest(){
    var active = originalTabs().find(function(element){
      if(normalizeText(element.textContent) !== '퀘스트') return false;
      return element.getAttribute('aria-selected') === 'true' || /(^|\s)(active|is-active|selected)(\s|$)/i.test(element.className || '');
    });
    if(active) openQuestApp();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',detectActiveQuest,{once:true});
  else window.setTimeout(detectActiveQuest,0);
})();
</script>`;

export function injectMemoryArchiveQuest(html: string) {
  let next = html;
  const headEnd = next.lastIndexOf("</head>");
  next = headEnd >= 0
    ? `${next.slice(0, headEnd)}${MEMORY_ARCHIVE_QUEST_STYLE}${next.slice(headEnd)}`
    : `${MEMORY_ARCHIVE_QUEST_STYLE}${next}`;
  const bodyEnd = next.lastIndexOf("</body>");
  return bodyEnd >= 0
    ? `${next.slice(0, bodyEnd)}${MEMORY_ARCHIVE_QUEST_SCRIPT}${next.slice(bodyEnd)}`
    : `${next}${MEMORY_ARCHIVE_QUEST_SCRIPT}`;
}
