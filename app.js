const $ = (sel)=>document.querySelector(sel);
const qs = (sel)=>document.querySelectorAll(sel);

function uid(){ return Math.random().toString(36).slice(2,9) }

const state = {
  subjects: [],
  notes: [],
  hoursPerDay: 4,
  sessionLen: 25,
  useSpaced: true,
  plan: {}, 
};

function loadState(){
  const raw = localStorage.getItem('asp_state');
  if(raw) Object.assign(state, JSON.parse(raw));
}
function saveState(){ localStorage.setItem('asp_state', JSON.stringify(state)) }

function parseInput(){
  const subjects = $('#subjectsInput').value.split(',').map(s=>s.trim()).filter(Boolean);
  const hoursPerDay = parseFloat($('#hoursPerDay').value) || 3;
  const sessionLen = parseInt($('#sessionLen').value)||25;
  const notes = $('#notes').value.split('\n').map(s=>s.trim()).filter(Boolean);
  const examDates = $('#examDates').value.split(',').map(s=>s.trim()).filter(Boolean);
  const useSpaced = $('#useSpaced').checked;
  return {subjects, hoursPerDay, sessionLen, notes, examDates, useSpaced};
}


function addDays(d, n){ let x = new Date(d); x.setDate(x.getDate()+n); return x; }
function fmt(d){ return d.toISOString().slice(0,10) }

function generatePlanFromInput(){
  const inp = parseInput();
  state.subjects = inp.subjects;
  state.notes = inp.notes;
  state.hoursPerDay = inp.hoursPerDay;
  state.sessionLen = inp.sessionLen;
  state.useSpaced = inp.useSpaced;

  const horizon = 14;
  const today = new Date();
  state.plan = {};


  const examMap = {};
  inp.examDates.forEach(ed=>{
    try{
      examMap[ed] = true;
    }catch(e){}
  });

  const baseTasks = [];
  state.subjects.forEach(sub=>{
    baseTasks.push({id:uid(), title:`${sub} — Read theory`, sub});
    baseTasks.push({id:uid(), title:`${sub} — Practice questions`, sub});
    baseTasks.push({id:uid(), title:`${sub} — Quick revision`, sub});
  });

  state.notes.forEach(n=>{
    baseTasks.push({id:uid(), title:`Topic: ${n}`, sub: (state.subjects[0]||'General')});
  });

  for(let day=0; day<horizon; day++){
    const date = fmt(addDays(today, day));
    state.plan[date] = [];
  }

  const sessionsPerDay = Math.max(1, Math.floor(state.hoursPerDay*60 / state.sessionLen));
  const taskQueue = [...baseTasks];
  let di = 0;
  while(taskQueue.length){
    const task = taskQueue.shift();
    const dateIndex = di % horizon;
    const dateKey = fmt(addDays(today, dateIndex));
    const planned = state.plan[dateKey];
    if(planned.length < sessionsPerDay){
      planned.push({...task, estMin: state.sessionLen, done:false});
    } else {
      let placed=false;
      for(let k=0;k<horizon;k++){
        const d2 = fmt(addDays(today, (dateIndex+k)%horizon));
        if(state.plan[d2].length < sessionsPerDay){
          state.plan[d2].push({...task, estMin: state.sessionLen, done:false});
          placed=true; break;
        }
      }
      if(!placed) {
        state.plan[fmt(addDays(today,horizon-1))].push({...task, estMin: state.sessionLen, done:false});
      }
    }
    di++;
  }

  if(state.useSpaced){
    const reviewOffsets = [2,5,12];
    const keys = Object.keys(state.plan);
    keys.forEach((d, idx)=>{
      state.plan[d].forEach(t=>{
        reviewOffsets.forEach(offset=>{
          const targetIdx = idx+offset;
          if(targetIdx < horizon){
            const dt = fmt(addDays(today, targetIdx));
            state.plan[dt].push({id:uid(), title:`Review: ${t.title}`, sub:t.sub, estMin: Math.max(10, Math.floor(t.estMin/2)), review:true, done:false});
          }
        });
      });
    });
  }

  saveState();
  renderPlan();
}

function renderPlan(){
  const todayKey = fmt(new Date());
  const todayTasks = state.plan[todayKey]||[];
  const $today = $('#todayTasks'); $today.innerHTML='';
  if(todayTasks.length===0) $today.innerHTML = '<p class="muted">No tasks for today. Generate a plan.</p>';
  todayTasks.forEach(task=>{
    const el = document.createElement('div'); el.className='task';
    el.innerHTML = `<div><p>${task.title}</p><div class="meta">${task.sub} • ${task.estMin} min ${task.review? '• review':''}</div></div>
      <div><button class="doneBtn">${task.done? '✓ Done' : 'Mark'}</button></div>`;
    const btn = el.querySelector('.doneBtn');
    btn.addEventListener('click', ()=>{
      task.done = !task.done;
      saveState();
      renderPlan();
    });
    $today.appendChild(el);
  });

  const $grid = $('#planGrid'); $grid.innerHTML='';
  const keys = Object.keys(state.plan).slice(0,14);
  keys.forEach(k=>{
    const d = new Date(k);
    const dayEl = document.createElement('div'); dayEl.className='day';
    dayEl.innerHTML = `<h4>${d.toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'})}</h4>`;
    const list = state.plan[k]||[];
    list.slice(0,6).forEach(it=>{
      const el = document.createElement('div'); el.className='badge';
      el.textContent = (it.review? '🔁 ':'') + it.title;
      dayEl.appendChild(el);
    });
    const more = list.length>6 ? document.createElement('div') : null;
    if(more){ more.className='badge'; more.textContent = `+${list.length-6} more`; dayEl.appendChild(more) }
    $grid.appendChild(dayEl);
  });
}

function wireup(){
  $('#generateBtn').addEventListener('click', (e)=>{
    e.preventDefault();
    generatePlanFromInput();
  });
  $('#clearBtn').addEventListener('click', (e)=>{
    e.preventDefault();
    if(confirm('Clear saved plan?')){ state.plan={}; saveState(); renderPlan(); }
  });
  $('#exportBtn').addEventListener('click', ()=>{
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='study-plan.json'; a.click();
    URL.revokeObjectURL(url);
  });
  $('#importBtn').addEventListener('click', ()=>{
    const inp = document.createElement('input'); inp.type='file'; inp.accept='.json';
    inp.onchange = ()=>{
      const file = inp.files[0];
      const reader = new FileReader();
      reader.onload = ()=>{ try{ Object.assign(state, JSON.parse(reader.result)); saveState(); renderPlan(); alert('Imported'); }catch(e){ alert('Invalid file') } }
      reader.readAsText(file);
    };
    inp.click();
  });
  $('#themeToggle').addEventListener('change',(e)=>{
    document.body.classList.toggle('light', e.target.checked);
  });
  loadState();
  $('#subjectsInput').value = state.subjects.join(', ');
  $('#hoursPerDay').value = state.hoursPerDay;
  $('#sessionLen').value = state.sessionLen;
  $('#notes').value = state.notes.join('\n');
  renderPlan();
}

document.addEventListener('DOMContentLoaded', wireup);
