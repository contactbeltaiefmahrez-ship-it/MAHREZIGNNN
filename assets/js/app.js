/* ═══════════════════════════════════════════════════════════════════════
   MAHREZIGN — VISUAL DESIGN LAB
   Three acts. Vanilla JS, no build step, hash routing (runs from file://).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

var D        = window.MZ_DATA;
var FIELDS   = D.worlds;              /* twelve fields of practice */
var PROJECTS = D.projects;
var ACADEMIA = D.academia;
var AUTHOR   = D.author;
var ALL      = PROJECTS.concat([ACADEMIA]);
var IMG      = "assets/img/";

function mq(q){ try { return window.matchMedia ? window.matchMedia(q).matches : false; }
                catch(e){ return false; } }
var REDUCED = mq("(prefers-reduced-motion: reduce)");
var FINE    = mq("(hover:hover) and (pointer:fine)");

var main    = document.getElementById("main");
var panel   = document.getElementById("mPanel");
var trigger = document.getElementById("mTrigger");
var locator = document.getElementById("locator");

/* ── helpers ─────────────────────────────────────────────────────────── */
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function byNum(n){ for (var i=0;i<ALL.length;i++) if (ALL[i].num===n) return ALL[i]; return null; }
function fieldOf(n){ for (var i=0;i<FIELDS.length;i++) if (FIELDS[i].n===n) return FIELDS[i]; return null; }
function pad(n){ return (n<10?"0":"")+n; }
function rc(r){ return r.replace(":","/"); }

function frame(a, ctx, opts){
  opts = opts || {};
  var alt = esc(a.title + (ctx && ctx.name ? " — " + ctx.name : "") +
                (ctx && ctx.discipline ? ", " + ctx.discipline : ""));
  var b = IMG + a.file;
  return '<div class="frame'+(opts.contain?" frame--contain":"")+'" style="--r:'+rc(a.ratio)+
    ';background-image:url(data:image/webp;base64,'+a.lqip+')">'+
    '<img src="'+b+'-1200.webp" srcset="'+b+'-480.webp 480w, '+b+'-1200.webp 1200w, '+
    b+'-2000.webp 2000w" sizes="'+(opts.sizes||"100vw")+'" width="'+a.w+'" height="'+a.h+
    '" alt="'+alt+'"'+(opts.eager?' loading="eager" fetchpriority="high"':' loading="lazy"')+
    ' decoding="async"></div>';
}

function armImages(root){
  Array.prototype.forEach.call(root.querySelectorAll("img"), function(im){
    if (im.classList.contains("is-in")) return;
    if (im.complete && im.naturalWidth) { im.classList.add("is-in"); return; }
    im.addEventListener("load", function(){ im.classList.add("is-in"); }, {once:true});
    im.addEventListener("error", function(){ im.classList.add("is-in"); }, {once:true});
  });
}

var revealIO = ("IntersectionObserver" in window) ? new IntersectionObserver(function(en){
  en.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add("is-in"); revealIO.unobserve(e.target); } });
}, {rootMargin:"0px 0px -8% 0px", threshold:.05}) : null;

function armReveal(root){
  var nodes = root.querySelectorAll(".rv");
  if (!revealIO || REDUCED){ Array.prototype.forEach.call(nodes, function(n){ n.classList.add("is-in"); }); return; }
  Array.prototype.forEach.call(nodes, function(n){ revealIO.observe(n); });
}

/* session trace — where the visitor has already been */
var seen = {p:{}, f:{}};
try { var raw = sessionStorage.getItem("mz.seen"); if (raw) seen = JSON.parse(raw); } catch(e){}
function mark(k,id){ seen[k][id]=1; try{ sessionStorage.setItem("mz.seen", JSON.stringify(seen)); }catch(e){} }

/* ── THE CUT — the signature interaction ─────────────────────────────── */
/* Two images meet along the diagonal borrowed from the M. The name is split
   by that same seam, so the typography is physically cut by the image edge. */
function cutHTML(a, b, word, ratio, ctx){
  var A = IMG + a.file, B = IMG + b.file;
  return '<div class="cut" data-cut style="--r:'+rc(ratio||"16:9")+'">'+
    '<div class="cut__layer cut__layer--a"><img src="'+A+'-1200.webp" srcset="'+A+'-480.webp 480w, '+
      A+'-1200.webp 1200w, '+A+'-2000.webp 2000w" sizes="100vw" alt="'+
      esc(a.title+(ctx?" — "+ctx:""))+'" decoding="async"></div>'+
    '<div class="cut__layer cut__layer--b"><img src="'+B+'-1200.webp" srcset="'+B+'-480.webp 480w, '+
      B+'-1200.webp 1200w, '+B+'-2000.webp 2000w" sizes="100vw" alt="'+
      esc(b.title+(ctx?" — "+ctx:""))+'" decoding="async"></div>'+
    '<span class="cut__seam"></span>'+
    '<div class="cut__type" aria-hidden="true">'+
      '<span class="cut__word cut__word--a">'+esc(word)+'</span>'+
      '<span class="cut__word cut__word--b">'+esc(word)+'</span>'+
    '</div>'+
    '<span class="cut__hint">Drag across</span></div>';
}

function armCuts(root){
  Array.prototype.forEach.call(root.querySelectorAll("[data-cut]"), function(el){
    var target = .5, cur = .5, running = false, touched = false;
    function set(p){
      target = Math.max(.04, Math.min(.96, p));
      if (!touched){ touched = true; el.classList.add("is-touched"); }
      if (!running){ running = true; requestAnimationFrame(loop); }
    }
    function loop(){
      cur += (target - cur) * .13;
      el.style.setProperty("--p", cur.toFixed(4));
      if (Math.abs(target - cur) < .0008){ running = false; return; }
      requestAnimationFrame(loop);
    }
    function fromX(x){
      var r = el.getBoundingClientRect();
      set((x - r.left) / r.width);
    }
    if (REDUCED){ el.style.setProperty("--p",".5"); return; }
    el.addEventListener("pointermove", function(e){
      if (e.pointerType === "touch" && !e.buttons) return;
      fromX(e.clientX);
    });
    el.addEventListener("pointerdown", function(e){ el.setPointerCapture(e.pointerId); fromX(e.clientX); });
    el.addEventListener("pointerleave", function(){ set(.5); });
    /* keyboard-reachable so the seam isn't pointer-only */
    el.tabIndex = 0;
    el.setAttribute("role","slider");
    el.setAttribute("aria-label","Reveal the second composition");
    el.setAttribute("aria-valuemin","0"); el.setAttribute("aria-valuemax","100");
    el.addEventListener("keydown", function(e){
      if (e.key === "ArrowLeft")  { set(target - .08); e.preventDefault(); }
      if (e.key === "ArrowRight") { set(target + .08); e.preventDefault(); }
      el.setAttribute("aria-valuenow", Math.round(target*100));
    });
  });
}

/* ── M panel ─────────────────────────────────────────────────────────── */
function buildFieldList(){
  var ul = document.getElementById("fieldList");
  ul.innerHTML = FIELDS.map(function(f){
    return '<li><a href="#/field/'+f.n+'" data-seen="'+(seen.f[f.n]?1:0)+
      '" data-cover="'+IMG+f.cover+'-480.webp">'+
      '<span class="fl-n">'+pad(f.n)+'</span><span class="fl-name">'+esc(f.name)+'</span>'+
      '<span class="fl-c">'+pad(f.count)+'</span></a></li>';
  }).join("");
  var prev = document.getElementById("mPreview");
  Array.prototype.forEach.call(ul.querySelectorAll("a"), function(a){
    a.addEventListener("mouseenter", function(){
      prev.style.backgroundImage = "url("+a.dataset.cover+")"; prev.classList.add("is-on");
    });
  });
  ul.addEventListener("mouseleave", function(){ prev.classList.remove("is-on"); });
}

var panelOpen = false;
function togglePanel(force){
  panelOpen = (typeof force === "boolean") ? force : !panelOpen;
  trigger.setAttribute("aria-expanded", String(panelOpen));
  if (panelOpen){
    Array.prototype.forEach.call(panel.querySelectorAll("a[data-seen]"), function(a){
      a.dataset.seen = seen.f[a.getAttribute("href").split("/").pop()] ? 1 : 0;
    });
    panel.hidden = false; document.body.classList.add("locked");
    requestAnimationFrame(function(){ panel.classList.add("is-open"); });
  } else {
    panel.classList.remove("is-open"); document.body.classList.remove("locked");
    setTimeout(function(){ if (!panelOpen) panel.hidden = true; }, REDUCED?0:850);
  }
}
trigger.addEventListener("click", function(){ togglePanel(); });
panel.addEventListener("click", function(e){ if (e.target.closest("a")) togglePanel(false); });
document.addEventListener("keydown", function(e){
  if (e.key === "Escape" && panelOpen){ togglePanel(false); trigger.focus(); }
});

function setAct(act, bits){
  document.body.dataset.act = act;
  Array.prototype.forEach.call(document.querySelectorAll("[data-act-link]"), function(a){
    a.classList.toggle("is-here", a.dataset.actLink === act);
  });
  locator.textContent = (bits||[]).join("  /  ");
}

/* ═════════════════════ ACT I — THE AUTHOR ════════════════════════════ */
function viewAuthor(){
  setAct("i", []);
  document.body.removeAttribute("data-tone");

  var F = AUTHOR.frames;
  var shapes = ["a","b","c","d","b","a","d","c"];

  var narrative = F.map(function(fr, i){
    var sizes = shapes[i] === "d" ? "100vw" : "(min-width:860px) 58vw, 100vw";
    return '<section class="nf nf--'+shapes[i]+'"><div class="nf__grid">'+
      '<div class="nf__media rv">'+
        '<button class="tap" data-open-author="'+i+'" data-cursor="VIEW" aria-label="View '+esc(fr.title)+' full size">'+
        frame(fr, {name:"Mahrez Beltaief", discipline:"MAHREZIGN portrait campaign"}, {sizes:sizes})+
        '<span class="nf__cap"><span>'+pad(fr.n)+' / 08</span><span>'+esc(fr.title)+'</span></span>'+
        '</button></div>'+
      '<div class="nf__body rv rv-1">'+
        '<p class="nf__n num">'+pad(fr.n)+'</p>'+
        '<h3 class="nf__t">'+esc(fr.title)+'</h3>'+
        '<p class="nf__l">'+esc(fr.line)+'</p>'+
      '</div></div></section>';
  }).join("");

  var disciplines = AUTHOR.disciplines.map(function(d){ return "<li>"+esc(d)+"</li>"; }).join("");

  main.innerHTML =
  '<section class="aopen">'+
    '<p class="micro">01 / The Author</p>'+
    '<h1 class="aopen__name">'+AUTHOR.name.split(" ").map(function(w){
      return "<span>"+esc(w)+"</span>"; }).join("")+'</h1>'+
    '<div class="aopen__sub"><p class="micro">MAHREZIGN — Visual Design Lab</p>'+
      '<p class="micro">Tunisia ↔ International</p></div>'+
    '<div class="aopen__cut rv">'+
      cutHTML(F[6], F[0], "MAHREZIGN", "16:9", "Mahrez Beltaief")+
    '</div>'+
    '<p class="aopen__lede">Nine years spent on one question: <em>how things are seen.</em></p>'+
  '</section>'+

  '<section class="bio" aria-label="Biography">'+
    '<div class="bio__row rv"><p class="bio__fig num">'+AUTHOR.age+'</p>'+
      '<div><p class="bio__k">Years old</p>'+
      '<p class="bio__v">A practice built early<br>and kept moving.</p></div></div>'+
    '<div class="bio__row rv"><p class="bio__fig bio__fig--wine num">0'+AUTHOR.years+'</p>'+
      '<div><p class="bio__k">Years of practice</p>'+
      '<p class="bio__v">Nine years of visual work<br>across every surface it lands on.</p></div></div>'+
    '<div class="bio__row rv"><div><p class="bio__k">Reach</p>'+
      '<p class="bio__reach"><span>Tunisia</span><span>and</span><span>International</span></p></div></div>'+
    '<div class="bio__row rv"><div><p class="bio__k">Disciplines</p>'+
      '<ul class="disciplines">'+disciplines+'</ul></div></div>'+
  '</section>'+

  '<div class="narr">'+narrative+'</div>'+

  '<section class="tools" aria-label="Tools">'+
    '<div class="band__head"><h2 class="band__title">The instrument field</h2>'+
    '<p class="band__note">Software and systems in active use. Hover a name to see '+
    'what it sits beside — the groupings are how the work actually divides.</p></div>'+
    '<div class="tools__field" id="toolField"></div>'+
  '</section>'+

  '<section class="band"><div class="band__head">'+
    '<h2 class="band__title">Act II — the work</h2>'+
    '<p class="band__note">Thirty-eight projects, two hundred and sixty images, '+
    'organised into twelve fields of practice.</p></div>'+
    '<a class="next" href="#/work" data-cursor="ENTER" style="border:0;padding:0">'+
      '<span class="next__k">Continue</span>'+
      '<p class="next__name">The Atlas</p>'+
      '<p class="next__d">12 fields — 38 projects — 260 images</p></a>'+
  '</section>';

  armImages(main); armReveal(main); armCuts(main); buildTools();
  currentSet = F; currentCtx = {name:"Mahrez Beltaief", discipline:"Portrait campaign"};
}

/* tool constellation — position by group, not by ranking */
function buildTools(){
  var host = document.getElementById("toolField");
  if (!host) return;
  var tools = AUTHOR.tools;
  var groups = [];
  tools.forEach(function(t){ if (groups.indexOf(t.g) < 0) groups.push(t.g); });

  var rings = [.34, .58, .82];
  var html = rings.map(function(r){
    return '<span class="tools__ring" style="width:'+(r*100)+'%;aspect-ratio:1"></span>';
  }).join("");
  html += '<p class="tools__core">Instruments<b>'+tools.length+'</b></p>';

  /* spread each group over its own arc so the field reads as structure */
  var per = {};
  tools.forEach(function(t){ per[t.g] = (per[t.g]||0) + 1; });
  var idx = {};
  html += tools.map(function(t, i){
    idx[t.g] = (idx[t.g]||0);
    var gi = groups.indexOf(t.g);
    var base = (gi / groups.length) * Math.PI * 2 - Math.PI/2;
    var span = (Math.PI * 2 / groups.length) * .82;
    var frac = per[t.g] > 1 ? (idx[t.g] / (per[t.g]-1) - .5) : 0;
    var ang  = base + frac * span;
    var r    = rings[idx[t.g] % rings.length] / 2 + .07;
    idx[t.g]++;
    var x = 50 + Math.cos(ang) * r * 100 * .96;
    var y = 50 + Math.sin(ang) * r * 100 * .96;
    return '<span class="tool" data-g="'+esc(t.g)+'" style="left:'+x.toFixed(2)+
      '%;top:'+y.toFixed(2)+'%">'+esc(t.n)+'</span>';
  }).join("");
  host.innerHTML = html;

  host.addEventListener("mouseover", function(e){
    var t = e.target.closest(".tool"); if (!t) return;
    host.classList.add("has-group");
    Array.prototype.forEach.call(host.querySelectorAll(".tool"), function(x){
      x.classList.toggle("is-lit", x.dataset.g === t.dataset.g);
    });
    host.querySelector(".tools__core").innerHTML = esc(t.dataset.g) +
      "<b>" + host.querySelectorAll('.tool[data-g="'+t.dataset.g+'"]').length + "</b>";
  });
  host.addEventListener("mouseleave", function(){
    host.classList.remove("has-group");
    Array.prototype.forEach.call(host.querySelectorAll(".tool"), function(x){ x.classList.remove("is-lit"); });
    host.querySelector(".tools__core").innerHTML = "Instruments<b>"+AUTHOR.tools.length+"</b>";
  });
}

/* ═════════════════════ ACT II — THE WORK ═════════════════════════════ */
var FEATURED = [6, 1, 30, 24, 12, 32, 35];

function viewWork(){
  setAct("ii", ["THE ATLAS", "12 FIELDS", "260 IMAGES"]);
  document.body.removeAttribute("data-tone");

  var atlas = FIELDS.map(function(f){
    return '<li><a href="#/field/'+f.n+'" data-cover="'+IMG+f.cover+'-480.webp" data-hover>'+
      '<span class="atlas__n num">'+pad(f.n)+'</span>'+
      '<h3 class="atlas__name">'+esc(f.name)+'</h3>'+
      '<p class="atlas__d">'+esc(f.desc)+'</p>'+
      '<span class="atlas__c num">'+pad(f.count)+' / '+f.assetCount+'</span></a></li>';
  }).join("");

  var sel = FEATURED.map(function(n){
    var p = byNum(n); if (!p) return "";
    var f = fieldOf(p.world);
    return '<article class="pcard rv">'+
      '<a class="tap" href="#/project/'+p.num+'" data-cursor="OPEN">'+
        frame({file:p.cover,ratio:p.coverRatio,lqip:p.coverLqip,title:p.concept,w:1600,h:1200},
              p, {sizes:"(min-width:860px) 45vw, 100vw"})+'</a>'+
      '<div class="pcard__row"><span class="pcard__n num">'+pad(p.num)+'</span>'+
      '<h3 class="pcard__name"><a href="#/project/'+p.num+'">'+esc(p.name)+'</a></h3></div>'+
      '<p class="pcard__d">'+esc(f?f.short:"Project 00")+' — '+esc(p.concept)+'</p></article>';
  }).join("");

  main.innerHTML =
  '<header class="fhead"><p class="micro">02 / The Work</p>'+
    '<h1 class="fhead__name" style="font-size:var(--t-xxl)">The Atlas</h1>'+
    '<p class="fhead__d">A curated design archive rather than a gallery. Twelve fields '+
    'of practice, thirty-eight projects, two hundred and sixty images. The thirty-seven '+
    'brand projects are speculative and self-initiated; Project 00 is an established campaign.</p>'+
    '<div class="fhead__meta"><p class="micro">12 Fields</p><p class="micro">38 Projects</p>'+
    '<p class="micro">260 Images</p></div></header>'+
  '<section class="band" style="padding-top:0"><ul class="atlas">'+atlas+'</ul>'+
    '<div class="hover-thumb" id="hoverThumb" aria-hidden="true"></div></section>'+
  '<section class="band" style="padding-top:0">'+
    '<div class="band__head"><h2 class="band__title">Entry points</h2>'+
    '<p class="band__note">Seven projects chosen for range, not for volume. '+
    'The rest is one click deeper.</p></div>'+
    '<div class="pgrid g-system" style="padding:0">'+sel+'</div></section>'+
  '<a class="next" href="#/archive" data-cursor="ENTER"><span class="next__k">Or see everything at once</span>'+
    '<p class="next__name">The Archive</p><p class="next__d">All 260 images, filterable</p></a>';

  armImages(main); armReveal(main); armHover();
}

function armHover(){
  var thumb = document.getElementById("hoverThumb");
  if (!thumb || !FINE) return;
  Array.prototype.forEach.call(main.querySelectorAll("[data-hover]"), function(a){
    a.addEventListener("mouseenter", function(){
      thumb.style.backgroundImage = "url("+a.dataset.cover+")"; thumb.classList.add("is-on"); });
    a.addEventListener("mouseleave", function(){ thumb.classList.remove("is-on"); });
  });
  window.addEventListener("mousemove", function(e){
    if (!thumb.classList.contains("is-on")) return;
    thumb.style.left = e.clientX+"px"; thumb.style.top = e.clientY+"px";
  });
}

function viewField(n){
  var f = fieldOf(n);
  if (!f) return viewWork();
  mark("f", n);
  setAct("ii", ["FIELD "+pad(f.n)+" / 12", f.short, pad(f.count)+" PROJECTS"]);
  document.body.removeAttribute("data-tone");

  var list = f.projects.map(function(num){
    var p = byNum(num); if (!p) return "";
    return '<article class="pcard rv">'+
      '<a class="tap" href="#/project/'+p.num+'" data-cursor="OPEN">'+
        frame({file:p.cover,ratio:p.coverRatio,lqip:p.coverLqip,title:p.concept,w:1600,h:1200},
              p, {sizes:"(min-width:860px) 55vw, 100vw"})+'</a>'+
      '<div class="pcard__row"><span class="pcard__n num">'+pad(p.num)+'</span>'+
      '<h3 class="pcard__name"><a href="#/project/'+p.num+'">'+esc(p.name)+'</a></h3></div>'+
      '<p class="pcard__d">'+esc(p.discipline)+' — '+esc(p.concept)+'</p></article>';
  }).join("");

  var nx = fieldOf(n === 12 ? 1 : n + 1);
  main.innerHTML =
  '<header class="fhead"><p class="micro">Field '+pad(f.n)+' of 12</p>'+
    '<h1 class="fhead__n num">'+pad(f.n)+'</h1>'+
    '<p class="fhead__name">'+esc(f.name)+'</p>'+
    '<p class="fhead__d">'+esc(f.desc)+'</p>'+
    '<div class="fhead__meta"><p class="micro">'+pad(f.count)+' Projects</p>'+
    '<p class="micro">'+f.assetCount+' Images</p><p class="micro">Speculative</p></div></header>'+
  '<div class="pgrid g-'+f.grammar+'">'+list+'</div>'+
  (nx ? '<a class="next" href="#/field/'+nx.n+'" data-cursor="NEXT">'+
        '<span class="next__k">Next field</span><p class="next__name">'+esc(nx.name)+'</p>'+
        '<p class="next__d">'+esc(nx.desc)+'</p></a>' : "");

  armImages(main); armReveal(main);
}

/* ── project ─────────────────────────────────────────────────────────── */
function shotFor(a, i, total, p){
  var cls = "shot", sizes = "(min-width:760px) 88vw, 100vw";
  if (a.role === "climax" || a.r >= 1.7) cls += " shot--bleed", sizes = "100vw";
  else if (a.ratio === "1:1")  cls += " shot--half"  + (i%2?" shot--right":""), sizes="(min-width:760px) 50vw, 100vw";
  else if (a.ratio === "9:16") cls += " shot--half"  + (i%3===1?" shot--right":""), sizes="(min-width:760px) 42vw, 100vw";
  else if (a.ratio === "3:4")  cls += " shot--offset"+ (i%2?" shot--right":""), sizes="(min-width:760px) 70vw, 100vw";
  return '<figure class="'+cls+' rv">'+
    '<button class="tap" data-open-set="'+i+'" data-cursor="VIEW" aria-label="View '+esc(a.title)+' full size">'+
      frame(a, p, {sizes:sizes})+'</button>'+
    '<figcaption class="cap"><span class="cap__i num">'+pad(a.seq)+' / '+pad(total)+'</span>'+
    '<p class="cap__t">'+esc(a.title)+'</p><span class="cap__r num">'+a.ratio+'</span></figcaption></figure>';
}

function viewProject(num){
  var p = byNum(num);
  if (!p) return viewWork();
  mark("p", num); if (p.world) mark("f", p.world);
  var f = fieldOf(p.world);
  setAct("ii", [(f ? "FIELD "+pad(f.n) : "PROJECT 00"), (f?f.short:"ACADEMIA"), pad(p.num)+" / 37"]);
  document.body.dataset.tone = (p.tone === "light") ? "light" : "dark";

  var A = p.assets;
  var seq = A.slice(1).map(function(a,i){ return shotFor(a, i+1, A.length, p); });
  /* a typographic interruption two-thirds through, breaking the image rhythm */
  if (seq.length > 3){
    seq.splice(Math.ceil(seq.length*0.62), 0,
      '<div class="interrupt rv"><p><em>'+esc(p.concept)+'</em></p></div>');
  }

  var rel = (p.related||[]).map(function(n){
    var r = byNum(n); if (!r) return "";
    var rf = fieldOf(r.world);
    return '<a class="rv" href="#/project/'+r.num+'" data-cursor="OPEN">'+
      frame({file:r.cover,ratio:r.coverRatio,lqip:r.coverLqip,title:r.concept,w:1200,h:900},
            r, {sizes:"(min-width:760px) 32vw, 100vw"})+
      '<div class="pcard__row"><span class="pcard__n num">'+pad(r.num)+'</span>'+
      '<h3 class="cap__t">'+esc(r.name)+'</h3></div>'+
      '<p class="pcard__d">'+esc(rf?rf.short:"Project 00")+'</p></a>';
  }).join("");

  var order = PROJECTS.map(function(x){ return x.num; });
  var np = byNum(p.num === 0 ? 1 : order[(order.indexOf(p.num)+1) % order.length]);
  var status = p.status === "existing" ? "Established campaign" : "Speculative project";
  var hero = A[0];
  var climax = A[A.length-1];

  main.innerHTML =
  '<header class="popen">'+
    '<div class="popen__grid"><div>'+
      '<p class="popen__k">'+(p.num===0?"Project 00":"Project "+pad(p.num))+' — '+
        esc(f?f.name:"Education advertising campaign")+'</p>'+
      '<h1 class="popen__name">'+esc(p.name)+'</h1>'+
      '<p class="popen__c">'+esc(p.concept)+'</p></div>'+
      '<p class="chip"><span class="chip__dot"></span>'+status+'</p></div>'+
    '<div class="popen__hero'+(hero.r<1.25?" popen__hero--tall":"")+'">'+
      (A.length > 1
        ? cutHTML(hero, climax, p.name, hero.r>=1.5?hero.ratio:"4:3", p.name)
        : '<button class="tap" data-open-set="0" data-cursor="VIEW">'+frame(hero,p,{sizes:"100vw",eager:true})+'</button>')+
    '</div></header>'+
  '<div class="seq">'+seq.join("")+'</div>'+
  '<dl class="pmeta">'+
    '<div><dt>Project</dt><dd>'+esc(p.name)+'</dd></div>'+
    '<div><dt>Field</dt><dd>'+(f?pad(f.n)+" — "+esc(f.short):"Project 00")+'</dd></div>'+
    '<div><dt>Discipline</dt><dd>'+esc(p.discipline)+'</dd></div>'+
    '<div><dt>Images</dt><dd class="num">'+pad(A.length)+'</dd></div>'+
    '<div><dt>Status</dt><dd>'+status+'</dd></div></dl>'+
  (rel ? '<section class="explore"><div class="band__head">'+
    '<h2 class="band__title">Follow the system</h2>'+
    '<p class="band__note">Related by material, typography or spatial language — not by category.</p></div>'+
    '<div class="explore__grid">'+rel+'</div></section>' : "")+
  (np ? '<a class="next" href="#/project/'+np.num+'" data-cursor="NEXT">'+
    '<span class="next__k">Next — '+pad(np.num)+'</span><p class="next__name">'+esc(np.name)+'</p>'+
    '<p class="next__d">'+esc(np.concept)+'</p></a>' : "")+
  (p.num === 37 ? '<section class="band" style="text-align:center">'+
    '<p class="micro">The edge of the archive</p>'+
    '<p class="interrupt" style="padding:1.5rem 0"><span class="serif" style="font-size:clamp(1.5rem,5vw,3.5rem)">'+
    'You have seen 260 images.<br><em style="color:var(--accent)">There are still more ways to see.</em></span></p>'+
    '<a class="next" href="#/connect" data-cursor="ENTER" style="border:0">'+
    '<span class="next__k">Act III</span><p class="next__name">The Connection</p></a></section>' : "");

  armImages(main); armReveal(main); armCuts(main);
  currentSet = A; currentCtx = p;
}

/* ── archive ─────────────────────────────────────────────────────────── */
var af = {field:"all", ratio:"all"};
function viewArchive(){
  setAct("ii", ["THE ARCHIVE", "260 IMAGES"]);
  document.body.removeAttribute("data-tone");
  var ff = [{k:"all",l:"All fields"}].concat(FIELDS.map(function(f){
    return {k:String(f.n), l:pad(f.n)+" "+f.short}; })).concat([{k:"0",l:"00 Academia"}]);
  var rr = ["all","16:9","9:16","4:3","3:4","1:1"];
  main.innerHTML =
  '<header class="fhead"><p class="micro">The complete archive</p>'+
    '<h1 class="fhead__name">260 images</h1>'+
    '<p class="fhead__d">Every asset, filterable by field and by format. The five ratios '+
    'are the work\'s own — nothing is cropped to fit a card.</p></header>'+
  '<div class="filters" role="group" aria-label="Filter by field">'+
    ff.map(function(x){ return '<button class="filt" data-f="field" data-v="'+x.k+
      '" aria-pressed="'+(af.field===x.k)+'">'+esc(x.l)+'</button>'; }).join("")+'</div>'+
  '<div class="filters" role="group" aria-label="Filter by ratio">'+
    rr.map(function(r){ return '<button class="filt" data-f="ratio" data-v="'+r+
      '" aria-pressed="'+(af.ratio===r)+'">'+(r==="all"?"All ratios":r)+'</button>'; }).join("")+'</div>'+
  '<div class="arch" id="archGrid"></div>';
  renderArch();
  main.addEventListener("click", function(e){
    var b = e.target.closest(".filt"); if (!b) return;
    af[b.dataset.f] = b.dataset.v;
    Array.prototype.forEach.call(main.querySelectorAll('.filt[data-f="'+b.dataset.f+'"]'),
      function(x){ x.setAttribute("aria-pressed", String(x.dataset.v === b.dataset.v)); });
    renderArch();
  });
}
function renderArch(){
  var grid = document.getElementById("archGrid"); if (!grid) return;
  var items = [];
  ALL.forEach(function(p){
    if (af.field !== "all" && String(p.world) !== af.field) return;
    p.assets.forEach(function(a){
      if (af.ratio !== "all" && a.ratio !== af.ratio) return;
      items.push({a:a,p:p});
    });
  });
  currentSet = items.map(function(x){ return x.a; });
  currentCtx = null; currentPairs = items;
  if (!items.length){ grid.innerHTML = '<p class="arch__empty">No images match that combination.</p>'; return; }
  grid.innerHTML = items.map(function(x,i){
    return '<button class="arch__it" data-open-set="'+i+'" data-cursor="VIEW" aria-label="View '+
      esc(x.a.title)+' from '+esc(x.p.name)+'">'+
      frame(x.a, x.p, {sizes:"(min-width:1200px) 18vw, (min-width:700px) 30vw, 46vw"})+
      '<span class="cap"><span class="cap__t">'+esc(x.p.name)+' — '+esc(x.a.title)+'</span></span></button>';
  }).join("");
  armImages(grid);
}

/* ═════════════════════ ACT III — THE CONNECTION ══════════════════════ */
function viewConnect(){
  setAct("iii", ["THE CONNECTION"]);
  document.body.removeAttribute("data-tone");
  var portals = D.contact.map(function(c){
    var glyph = c.k === "behance"
      ? "<i></i><i></i><i></i><i></i>"
      : (c.k === "instagram" || c.k === "linkedin" || c.k === "email") ? "<i></i><i></i>" : "<i></i>";
    var ext = c.k === "email" ? "" : ' target="_blank" rel="noopener noreferrer"';
    return '<li class="rv"><a class="portal" href="'+esc(c.h)+'"'+ext+' data-cursor="OPEN">'+
      '<span class="portal__g pg-'+c.k+'" aria-hidden="true">'+glyph+'</span>'+
      '<span class="portal__l">'+esc(c.l)+'</span>'+
      '<span class="portal__s">'+(c.h.indexOf("REPLACE")>-1 ? "Add link" : "Open")+'</span></a></li>';
  }).join("");

  main.innerHTML =
  '<section class="conn">'+
    '<p class="micro">03 / The Connection</p>'+
    '<h1 class="conn__big">Let\'s make something <em>worth remembering.</em></h1>'+
    '<ul class="portals">'+portals+'</ul>'+
    '<div class="todo"><b>To complete</b><br>The six links are placeholders. Open '+
    '<code>assets/js/data.js</code> and replace every value beginning with '+
    '<code>REPLACE_</code> — they sit together in one <code>contact</code> block at the end '+
    'of the file. Nothing has been invented on your behalf.</div>'+
  '</section>'+
  '<footer class="signoff">'+
    '<span class="signoff__m" aria-hidden="true"></span>'+
    '<p class="signoff__n">Mahrez Beltaief</p>'+
    '<p class="micro">MAHREZIGN — Visual Design Lab</p>'+
    '<p class="micro">Tunisia ↔ International — 09 years of practice</p>'+
  '</footer>';
  armReveal(main);
}

/* ── viewer ──────────────────────────────────────────────────────────── */
var currentSet = [], currentCtx = null, currentPairs = null, vI = 0, lastFocus = null;
var viewer = document.getElementById("viewer");
var vStage = document.getElementById("viewerStage");
var vMeta  = document.getElementById("viewerMeta");

function openViewer(i){
  if (!currentSet.length) return;
  vI = i; lastFocus = document.activeElement;
  viewer.hidden = false; document.body.classList.add("locked");
  requestAnimationFrame(function(){ viewer.classList.add("is-open"); });
  paint(); document.getElementById("viewerClose").focus();
}
function closeViewer(){
  viewer.classList.remove("is-open"); document.body.classList.remove("locked");
  setTimeout(function(){ viewer.hidden = true; }, 300);
  if (lastFocus) lastFocus.focus();
}
function step(d){ vI = (vI + d + currentSet.length) % currentSet.length; paint(); }
function paint(){
  var a = currentSet[vI];
  var ctx = currentCtx || (currentPairs ? currentPairs[vI].p : {name:""});
  var b = IMG + a.file;
  vStage.innerHTML = '<img src="'+b+'-1200.webp" srcset="'+b+'-1200.webp 1200w, '+b+
    '-2000.webp 2000w" sizes="92vw" alt="'+esc(a.title+" — "+(ctx.name||""))+'" decoding="async">';
  vMeta.innerHTML = '<span class="num">'+pad(vI+1)+' / '+pad(currentSet.length)+'</span>'+
    '<span class="vm-t">'+esc(a.title)+'</span><span>'+esc(ctx.name||"")+'</span>'+
    '<span class="num">'+a.ratio+'</span><span class="num">'+a.w+'×'+a.h+'</span>';
  armImages(vStage);
}
document.getElementById("viewerClose").addEventListener("click", closeViewer);
document.getElementById("viewerPrev").addEventListener("click", function(){ step(-1); });
document.getElementById("viewerNext").addEventListener("click", function(){ step(1); });
document.addEventListener("keydown", function(e){
  if (viewer.hidden) return;
  if (e.key === "Escape") closeViewer();
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});
main.addEventListener("click", function(e){
  var b = e.target.closest("[data-open-set]");
  if (b) return openViewer(parseInt(b.dataset.openSet,10));
  var a = e.target.closest("[data-open-author]");
  if (a) openViewer(parseInt(a.dataset.openAuthor,10));
});

/* ── cursor ──────────────────────────────────────────────────────────── */
if (FINE && !REDUCED){
  var cur = document.getElementById("cursor");
  var lab = cur.querySelector(".cursor__label");
  var mx=0,my=0,rx=0,ry=0,run=false;
  function loop(){
    rx += (mx-rx)*.2; ry += (my-ry)*.2;
    cur.style.transform = "translate("+rx+"px,"+ry+"px) translate(-50%,-50%)";
    if (Math.abs(mx-rx)<.1 && Math.abs(my-ry)<.1){ run=false; return; }
    requestAnimationFrame(loop);
  }
  document.addEventListener("mousemove", function(e){
    mx=e.clientX; my=e.clientY; cur.classList.add("is-on");
    if (!run){ run=true; requestAnimationFrame(loop); }
    var t = e.target.closest("[data-cursor]");
    var c = e.target.closest("[data-cut]");
    if (c){ cur.classList.add("is-label"); lab.textContent = "DRAG"; }
    else if (t){ cur.classList.add("is-label"); lab.textContent = t.dataset.cursor; }
    else cur.classList.remove("is-label");
  });
  document.addEventListener("mouseleave", function(){ cur.classList.remove("is-on"); });
}

/* ── router ──────────────────────────────────────────────────────────── */
var wipe = document.getElementById("wipe");
function render(){
  var seg = (location.hash || "#/").replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!viewer.hidden) closeViewer();
  currentPairs = null; currentCtx = null;
  if (seg[0] === "work")         viewWork();
  else if (seg[0] === "field")   viewField(parseInt(seg[1],10));
  else if (seg[0] === "project") viewProject(parseInt(seg[1],10));
  else if (seg[0] === "archive") viewArchive();
  else if (seg[0] === "connect") viewConnect();
  else                           viewAuthor();
  window.scrollTo(0,0);
  main.focus({preventScroll:true});
}
function route(){
  if (REDUCED){ render(); return; }
  wipe.classList.remove("is-out"); wipe.classList.add("is-in");
  setTimeout(function(){
    render();
    wipe.classList.remove("is-in"); wipe.classList.add("is-out");
  }, 420);
}
window.addEventListener("hashchange", route);

/* ── overture — plays once per session, skippable ────────────────────── */
(function overture(){
  var ov = document.getElementById("overture");
  var played = false;
  try { played = sessionStorage.getItem("mz.ov") === "1"; } catch(e){}
  if (played || REDUCED){ ov.hidden = true; return; }
  try { sessionStorage.setItem("mz.ov","1"); } catch(e){}
  function end(){
    if (ov.classList.contains("is-done")) return;
    ov.classList.add("is-done");
    setTimeout(function(){ ov.hidden = true; }, 750);
  }
  setTimeout(end, 2600);
  ["pointerdown","keydown","wheel","touchstart"].forEach(function(ev){
    window.addEventListener(ev, end, {once:true, passive:true});
  });
})();

buildFieldList();
render();

})();
