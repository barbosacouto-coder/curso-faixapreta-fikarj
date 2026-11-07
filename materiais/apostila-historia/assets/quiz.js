// Quiz reutilizável: <div class="quiz" data-answer="2"><p>Pergunta</p><ol><li>..</li></ol><div class="fb"></div></div>
document.querySelectorAll('.quiz').forEach(q=>{
  const ans=+q.dataset.answer, fb=q.querySelector('.fb'), why=q.dataset.why||'';
  q.querySelectorAll('li').forEach((li,i)=>{
    const b=document.createElement('button'); b.textContent=li.textContent; li.textContent=''; li.appendChild(b);
    b.onclick=()=>{q.querySelectorAll('button').forEach(x=>x.disabled=true);
      const ok=i===ans; b.classList.add(ok?'ok':'bad');
      q.querySelectorAll('button')[ans].classList.add('ok');
      fb.textContent=(ok?'✓ Correto. ':'✗ Não. ')+why;};
  });
});
