document.getElementById('yr').textContent=new Date().getFullYear();
const lux=document.getElementById('lux');let v=412;
setInterval(()=>{v=Math.max(250,Math.min(600,v+Math.round((Math.random()-.5)*30)));lux.textContent=v},1500);
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.1});
document.querySelectorAll('.feat,.step').forEach(el=>{el.classList.add('rv');io.observe(el)});
