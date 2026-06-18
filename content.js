/*
 * content.js
 */
(function () {
  "use strict";

  var CONFIG = { decimals: 2 };

  function mean(a) {
    if (!a||!a.length) return null;
    return a.reduce(function(s,x){return s+x;},0)/a.length;
  }
  function fmt(n) {
    return (n==null||isNaN(n))?"—":Number(n).toFixed(CONFIG.decimals);
  }

  /* ============================================================
   * INJECTION BLOB
   * ============================================================ */
  var pageScriptCode = `
(function() {
  var results = [];
  var helps = document.querySelectorAll('[id^="note_"][id$="_help"]');
  var total = helps.length;
  var idx = 0;
  if (total === 0) {
    window.postMessage({ source:'ugn-page', type:'NOTES_DATA', payload:[] }, location.origin);
    return;
  }
  var originalEval = window.eval;
  function processNext() {
    if (idx >= total) {
      window.eval = originalEval;
      window.postMessage({ source:'ugn-page', type:'NOTES_DATA', payload:results }, location.origin);
      return;
    }
    var el = helps[idx++];
    var fn = el.fnToCall;
    if (typeof fn !== 'function') { processNext(); return; }
    var captured = null;
    window.eval = function(code) { captured = code; return originalEval(code); };
    try { fn.call(el); } catch(e) {}
    window.eval = originalEval;
    if (captured) {
      var mv = captured.match(/setValues\\(\\s*\\[([^\\]]*)\\]\\s*\\)/);
      if (mv) {
        var values = mv[1].split(',')
          .map(function(s){ return parseFloat(s.trim()); })
          .filter(function(n){ return !isNaN(n); });
        if (values.length > 0)
          results.push({ helpId:el.id, noteId:el.id.replace(/_help$/,''), values:values });
      }
    }
    setTimeout(processNext, 0);
  }
  processNext();
})();
`;

  function injectViaBlob() {
    var blob = new Blob([pageScriptCode], {type:'application/javascript'});
    var url = URL.createObjectURL(blob);
    var s = document.createElement('script');
    s.src = url;
    s.onload = function(){ URL.revokeObjectURL(url); s.remove(); };
    s.onerror = function(){ URL.revokeObjectURL(url); s.remove(); injectViaInline(); };
    (document.head||document.documentElement).appendChild(s);
  }
  function injectViaInline() {
    var s = document.createElement('script');
    s.textContent = pageScriptCode;
    (document.head||document.documentElement).appendChild(s);
    s.remove();
  }

  window.addEventListener('message', function(event) {
    if (event.source!==window||event.origin!==location.origin) return;
    var d = event.data;
    if (!d||d.source!=='ugn-page'||d.type!=='NOTES_DATA'||!Array.isArray(d.payload)) return;
    try { run(d.payload); } catch(e) { console.error('[stats-notes]',e); }
  });

  /* ============================================================
   * HELPERS DOM
   * ============================================================ */
  function getMatiereLabel(noteEl) {
    var row = noteEl.closest('tr');
    if (!row) return null;
    var span = row.querySelector('.OrgaUENameMin span[id^="mat_"]');
    return span ? span.textContent.trim() : null;
  }

  function getCoefMatiere(noteEl) {
    var row = noteEl.closest('tr');
    if (!row) return 1;
    var coefCell = row.querySelector('div[style*="width:160px"]');
    var src = coefCell ? coefCell.textContent : row.textContent;
    var m = src.match(/coef[\s.:]*([0-9]+(?:[.,][0-9]+)?)/i);
    return m ? parseFloat(m[1].replace(',', '.')) : 1;
  }

  function getSousCoef(noteEl) {
    var parent = noteEl.parentElement;
    var next = parent ? parent.nextElementSibling : null;
    if (!next) return 1;
    var txt = next.textContent || '';
    var m = txt.match(/\(([0-9]+(?:[.,][0-9]+)?)\)\s*\]?\s*$/);
    return m ? parseFloat(m[1].replace(',', '.')) : 1;
  }

  function getSousCoefLabel(noteEl) {
    var parent = noteEl.parentElement;
    var next = parent ? parent.nextElementSibling : null;
    if (!next) return null;
    var txt = (next.textContent || '').trim();
    return txt.replace(/^\[/, '').replace(/\]$/, '').trim() || null;
  }

  function getEcts(el) {
    if (!el) return null;
    var ectsCell = el.querySelector('td.OrgaUETitleElmt, th.OrgaUETitleElmt');
    var src = ectsCell ? ectsCell.textContent : el.textContent;
    var m = src.match(/([0-9]+(?:[.,][0-9]+)?)\s*ECTS/i);
    return m ? parseFloat(m[1].replace(',','.')) : null;
  }

  /* ============================================================
   * MODÈLE
   * ============================================================ */
  function buildModel(entries) {
    var evalMap = {};
    entries.forEach(function(e) {
      var noteEl = document.getElementById(e.noteId);
      if (!noteEl) return;
      var domTxt = (noteEl.textContent||'').trim().replace(',','.');
      var userNote = parseFloat(domTxt);
      if (isNaN(userNote)) userNote = null;
      var classAvg = mean(e.values);
      var total = e.values.length;
      var rank = userNote!=null
        ? e.values.filter(function(v){return v>userNote;}).length+1
        : null;
      evalMap[e.noteId] = {
        noteId: e.noteId,
        values: e.values,
        userNote: userNote,
        classAvg: classAvg,
        total: total,
        rank: rank,
        noteEl: noteEl,
        label: getMatiereLabel(noteEl),
        coefMatiere: getCoefMatiere(noteEl),
        sousCoef: getSousCoef(noteEl),
        sousCoefLabel: getSousCoefLabel(noteEl)
      };
    });

    var matiereMap = new Map();
    Object.values(evalMap).forEach(function(ev) {
      var row = ev.noteEl.closest('tr');
      if (!row) return;
      if (!matiereMap.has(row)) matiereMap.set(row, { row:row, evals:[], coefMatiere:ev.coefMatiere, label:ev.label });
      matiereMap.get(row).evals.push(ev);
    });

    var matieres = [];
    matiereMap.forEach(function(mat) {
      var nC=0, dC=0;
      var hasUserNote = false;
      mat.evals.forEach(function(ev) {
        if (ev.classAvg!=null) { nC+=ev.sousCoef*ev.classAvg; dC+=ev.sousCoef; }
        if (ev.userNote!=null) hasUserNote = true;
      });
      mat.classAvgMat = dC ? nC/dC : null;
      mat.hasUserNote = hasUserNote;
      matieres.push(mat);
    });

    var ueMap = new Map();
    matieres.forEach(function(mat) {
      var ueEl = mat.row.closest('table.OrgaUE') || mat.row.closest('.OrgaUERecap');
      if (!ueMap.has(ueEl)) ueMap.set(ueEl, { ueEl:ueEl, matieres:[] });
      ueMap.get(ueEl).matieres.push(mat);
    });

    var ues = [];
    ueMap.forEach(function(val) {
      var ueIdEl = val.ueEl ? val.ueEl.querySelector('span[id^="ue_"]') : null;
      var ueId = ueIdEl ? ueIdEl.id : null;
      var ueName = ueIdEl ? ueIdEl.textContent.trim() : null;
      var avgUeSpanId = ueId ? 'avg_ue_'+ueId.replace('ue_','') : null;

      var n=0, d=0;
      var ueHasUserNote = false;
      val.matieres.forEach(function(mat) {
        if (mat.classAvgMat!=null && mat.coefMatiere>0) {
          n+=mat.coefMatiere*mat.classAvgMat;
          d+=mat.coefMatiere;
        }
        if (mat.hasUserNote) ueHasUserNote = true;
      });
      ues.push({
        ueEl: val.ueEl,
        ueName: ueName,
        ects: getEcts(val.ueEl),
        classAvgUE: d ? n/d : null,
        hasUserNote: ueHasUserNote,
        avgUeSpanId: avgUeSpanId,
        matieres: val.matieres,
        _n: n,
        _d: d
      });
    });

    var gn=0, gd=0;
    ues.forEach(function(u) {
      if (u.ects!=null && u.classAvgUE!=null && u.hasUserNote) {
        gn+=u.ects*u.classAvgUE; gd+=u.ects;
      }
    });

    var allEvals = [];
    Object.values(evalMap).forEach(function(ev) { allEvals.push(ev); });

    return { evals:allEvals, ues:ues, general:gd?gn/gd:null, _gn:gn, _gd:gd };
  }

  /* ============================================================
   * UI
   * ============================================================ */
  function injectLogo() {
    if (document.getElementById('ugn-logo-replaced')) return;

    var img = document.querySelector('img[src*="gestnote_ico"]');
    if (!img) return;

    img.id = 'ugn-logo-replaced';
    img.src = chrome.runtime.getURL('GestNote_Elite-48x48.png');
    img.alt = 'GestNote Elite';
    img.style.height = '20px';
    img.style.width = '20px';
    img.style.borderRadius = '4px';
    img.style.verticalAlign = 'middle';
    img.style.marginRight = '10px';

    var label = img.nextElementSibling;
    if (label && label.textContent.trim() === 'GestNote') {
      label.textContent = 'GestNote Elite';
    }
  }

  function injectCredit() {
    if (document.getElementById('ugn-credit')) return;

    var candidates = document.querySelectorAll('div[style*="font-style:italic"]');
    var target = null;
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].textContent.indexOf('En passant la souris sur une note') !== -1) {
        target = candidates[i];
        break;
      }
    }
    if (!target) return;

    var credit = document.createElement('div');
    credit.id = 'ugn-credit';
    credit.innerHTML = '<b>GestNote Elite</b> est une extension faite par un étudiant pour les étudiants. ' +
      'N\'hésitez pas à contacter <a href="mailto:eliot.gateway.dev@gmail.com">eliot.gateway.dev@gmail.com</a> ' +
      'afin de poser des questions ou proposer des ajouts.';

    var table = document.querySelector('#notetab .selectionMatiereUEMin');
    if (table) {
      var w = table.getBoundingClientRect().width;
      credit.style.width = w + 'px';
      credit.style.boxSizing = 'border-box';
      credit.style.marginLeft = 'auto';
      credit.style.marginRight = 'auto';
    }

    target.parentNode.insertBefore(credit, target.nextSibling);
  }

  function run(entries) {
    var model = buildModel(entries);

    injectLogo();
    injectCredit();

    model.evals.forEach(function(ev) {
      if (ev.noteEl.dataset.ugnDone==='1') return;
      ev.noteEl.dataset.ugnDone='1';
      injectBadge(ev);
    });

    model.ues.forEach(function(u) { injectUeAvg(u); });
    injectGeneralAvg(model);
  }

  function injectBadge(ev) {
    var parent = ev.noteEl.parentElement;
    parent.style.cssText += ';display:flex!important;align-items:center;float:left;';

    var badge = document.createElement('div');
    badge.className = 'ugn-badge';
    badge.title = 'Moyenne de classe';
    badge.textContent = fmt(ev.classAvg);

    var rankBadge = document.createElement('div');
    rankBadge.className = 'ugn-rank';
    rankBadge.title = 'Ton classement';
    rankBadge.textContent = ev.rank!=null ? ev.rank+'/'+ev.total : '—';

    var btn = document.createElement('div');
    btn.className = 'ugn-chart-btn';
    btn.title = 'Voir la répartition';
    btn.textContent = '▲';
    btn.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      openChart(ev);
    });

    parent.appendChild(badge);
    parent.appendChild(rankBadge);
    parent.appendChild(btn);
  }

  function injectUeAvg(u) {
    if (u.classAvgUE==null||!u.avgUeSpanId) return;
    var span = document.getElementById(u.avgUeSpanId);
    if (!span||span.dataset.ugnUe==='1') return;
    span.dataset.ugnUe='1';
    var tag = document.createElement('span');
    tag.className = 'ugn-ue-avg';
    tag.title = 'Cliquer pour voir le détail du calcul';
    tag.textContent = ' (moy. ' + fmt(u.classAvgUE) + ')';
    tag.style.cursor = 'pointer';
    tag.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      openUeDetail(u);
    });
    span.insertAdjacentElement('afterend', tag);
  }

  function injectGeneralAvg(model) {
    if (model.general==null) return;
    var span = document.getElementById('avg');
    if (!span||span.dataset.ugnGen==='1') return;
    span.dataset.ugnGen='1';
    var tag = document.createElement('span');
    tag.className = 'ugn-gen-avg';
    tag.title = 'Cliquer pour voir le détail du calcul';
    tag.textContent = ' (moy. ' + fmt(model.general) + ')';
    tag.style.cursor = 'pointer';
    tag.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      openGeneralDetail(model);
    });
    span.insertAdjacentElement('afterend', tag);
  }

  /* ============================================================
   * MODALE DÉTAIL UE
   * ============================================================ */
  function detailClose(e){ if(e.key==='Escape') closeDetail(); }
  function closeDetail(){
    var o=document.querySelector('.ugn-detail-overlay');
    if(o) o.remove();
    document.removeEventListener('keydown',detailClose);
  }

  function openUeDetail(u) {
    closeDetail();
    closeChart();

    var overlay = document.createElement('div');
    overlay.className = 'ugn-detail-overlay';
    overlay.addEventListener('click', function(e){ if(e.target===overlay) closeDetail(); });

    var modal = document.createElement('div');
    modal.className = 'ugn-detail-modal';

    // En-tête
    var head = document.createElement('div');
    head.className = 'ugn-detail-head';
    var title = document.createElement('span');
    title.className = 'ugn-detail-title';
    title.textContent = (u.ueName || 'UE') + (u.ects ? ' · ' + u.ects + ' ECTS' : '');
    var closeBtn = document.createElement('button');
    closeBtn.className = 'ugn-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closeDetail);
    head.appendChild(title);
    head.appendChild(closeBtn);

    // Corps : tableau des matières
    var body = document.createElement('div');
    body.className = 'ugn-detail-body';

    var table = document.createElement('table');
    table.className = 'ugn-detail-table';

    // Ligne d'en-tête
    var thead = document.createElement('thead');
    var hrow = document.createElement('tr');
    ['Matière', 'Coef', 'Moy. classe', 'Étudiants', 'Contribution'].forEach(function(h) {
      var th = document.createElement('th');
      th.textContent = h;
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var matieres_with_data = u.matieres.filter(function(m){ return m.classAvgMat != null; });

    u.matieres.forEach(function(mat) {
      var tr = document.createElement('tr');
      if (mat.classAvgMat == null) tr.className = 'ugn-detail-row-na';

      var tdName = document.createElement('td');
      tdName.className = 'ugn-detail-matname';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = mat.label || '—';
      tdName.appendChild(nameSpan);

      if (mat.evals.length > 1 && mat.classAvgMat != null) {
        var subul = document.createElement('ul');
        subul.className = 'ugn-detail-evals';
        mat.evals.forEach(function(ev) {
          if (ev.classAvg == null) return;
          var li = document.createElement('li');
          var lbl = ev.sousCoefLabel || ev.noteId;
          li.textContent = lbl + ' → ' + fmt(ev.classAvg) + ' (coef ' + ev.sousCoef + ', n=' + ev.total + ')';
          subul.appendChild(li);
        });
        tdName.appendChild(subul);
      }

      var tdCoef = document.createElement('td');
      tdCoef.className = 'ugn-detail-num';
      tdCoef.textContent = mat.coefMatiere;

      var tdAvg = document.createElement('td');
      tdAvg.className = 'ugn-detail-num ugn-detail-avg';
      tdAvg.textContent = mat.classAvgMat != null ? fmt(mat.classAvgMat) : '—';

      var tdN = document.createElement('td');
      tdN.className = 'ugn-detail-num';
      var maxN = 0;
      mat.evals.forEach(function(ev){ if(ev.total > maxN) maxN = ev.total; });
      tdN.textContent = mat.classAvgMat != null ? maxN : '—';

      var tdContrib = document.createElement('td');
      tdContrib.className = 'ugn-detail-num ugn-detail-contrib';
      if (mat.classAvgMat != null && mat.coefMatiere > 0) {
        tdContrib.textContent = mat.coefMatiere + ' × ' + fmt(mat.classAvgMat)
          + ' = ' + fmt(mat.coefMatiere * mat.classAvgMat);
      } else {
        tdContrib.textContent = '—';
        tdContrib.style.color = '#94a3b8';
      }

      tr.appendChild(tdName);
      tr.appendChild(tdCoef);
      tr.appendChild(tdAvg);
      tr.appendChild(tdN);
      tr.appendChild(tdContrib);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);

    var result = document.createElement('div');
    result.className = 'ugn-detail-result';

    var parts = matieres_with_data.map(function(m) {
      return m.coefMatiere + ' × ' + fmt(m.classAvgMat);
    });
    var num_str = '(' + parts.join(' + ') + ')';
    var den_str = matieres_with_data.map(function(m){ return m.coefMatiere; }).join(' + ');

    result.innerHTML =
      '<span class="ugn-detail-formula">'
      + num_str + ' / (' + den_str + ')'
      + '</span>'
      + ' = <span class="ugn-detail-final">' + fmt(u.classAvgUE) + '</span>';

    body.appendChild(result);

    modal.appendChild(head);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', detailClose);
  }

  /* ============================================================
   * MODALE DÉTAIL GÉNÉRAL
   * ============================================================ */
  function openGeneralDetail(model) {
    closeDetail();
    closeChart();

    var overlay = document.createElement('div');
    overlay.className = 'ugn-detail-overlay';
    overlay.addEventListener('click', function(e){ if(e.target===overlay) closeDetail(); });

    var modal = document.createElement('div');
    modal.className = 'ugn-detail-modal';

    var head = document.createElement('div');
    head.className = 'ugn-detail-head';
    var title = document.createElement('span');
    title.className = 'ugn-detail-title';
    title.textContent = 'Moyenne générale de classe';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'ugn-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closeDetail);
    head.appendChild(title);
    head.appendChild(closeBtn);

    var body = document.createElement('div');
    body.className = 'ugn-detail-body';

    var table = document.createElement('table');
    table.className = 'ugn-detail-table';

    var thead = document.createElement('thead');
    var hrow = document.createElement('tr');
    ['UE', 'ECTS', 'Moy. classe UE', 'Contribution'].forEach(function(h) {
      var th = document.createElement('th');
      th.textContent = h;
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var included = model.ues.filter(function(u){ return u.ects!=null && u.classAvgUE!=null && u.hasUserNote; });

    model.ues.forEach(function(u) {
      var active = u.ects!=null && u.classAvgUE!=null && u.hasUserNote;
      var tr = document.createElement('tr');
      if (!active) tr.className = 'ugn-detail-row-na';

      var tdName = document.createElement('td');
      tdName.className = 'ugn-detail-matname';
      tdName.textContent = u.ueName || u.avgUeSpanId || '—';

      var tdEcts = document.createElement('td');
      tdEcts.className = 'ugn-detail-num';
      tdEcts.textContent = u.ects != null ? u.ects : '—';

      var tdAvg = document.createElement('td');
      tdAvg.className = 'ugn-detail-num ugn-detail-avg';
      tdAvg.textContent = u.classAvgUE != null ? fmt(u.classAvgUE) : '—';

      var tdContrib = document.createElement('td');
      tdContrib.className = 'ugn-detail-num ugn-detail-contrib';
      if (active) {
        tdContrib.textContent = u.ects + ' × ' + fmt(u.classAvgUE)
          + ' = ' + fmt(u.ects * u.classAvgUE);
      } else {
        tdContrib.textContent = u.classAvgUE == null ? 'pas de données classe'
          : !u.hasUserNote ? 'aucune note personnelle'
          : '—';
        tdContrib.style.color = '#94a3b8';
        tdContrib.style.fontStyle = 'italic';
      }

      tr.appendChild(tdName);
      tr.appendChild(tdEcts);
      tr.appendChild(tdAvg);
      tr.appendChild(tdContrib);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);

    var result = document.createElement('div');
    result.className = 'ugn-detail-result';
    var parts = included.map(function(u){ return u.ects + ' × ' + fmt(u.classAvgUE); });
    var den_str = included.map(function(u){ return u.ects; }).join(' + ');
    result.innerHTML =
      '<span class="ugn-detail-formula">'
      + '(' + parts.join(' + ') + ') / (' + den_str + ')'
      + '</span>'
      + ' = <span class="ugn-detail-final">' + fmt(model.general) + '</span>';
    body.appendChild(result);

    modal.appendChild(head);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', detailClose);
  }

  /* ============================================================
   * GRAPHIQUE SVG avec tooltip hover
   * ============================================================ */
  function buildExactPoints(values) {
    var counts = {};
    values.forEach(function(v){ var k=String(v); counts[k]=(counts[k]||0)+1; });
    return Object.keys(counts)
      .map(function(k){ return {x:parseFloat(k),c:counts[k]}; })
      .sort(function(a,b){ return a.x-b.x; });
  }

  function curveSVG(values, userNote, classAvg, svgId) {
    var W=580, H=320, padL=44, padR=24, padT=48, padB=44;
    var plotW=W-padL-padR, plotH=H-padT-padB;

    var pts = buildExactPoints(values);
    if (!pts.length) return '<svg viewBox="0 0 580 320" class="ugn-svg" xmlns="http://www.w3.org/2000/svg">'
      +'<text x="290" y="160" text-anchor="middle" class="ugn-axis-lbl">Pas de données</text></svg>';

    var lo=pts[0].x, hi=pts[pts.length-1].x;
    var margin=(hi-lo)>0?(hi-lo)*0.10:1;
    var xMin=lo-margin, xMax=hi+margin;
    var maxC=Math.max.apply(null,pts.map(function(p){return p.c;}));
    if (maxC===0) maxC=1;

    var xS=function(v){return padL+((v-xMin)/(xMax-xMin))*plotW;};
    var yS=function(c){return padT+plotH-(c/maxC)*plotH;};

    var svg='<svg id="'+svgId+'" viewBox="0 0 '+W+' '+H+'" class="ugn-svg" xmlns="http://www.w3.org/2000/svg">';
    svg+='<rect x="'+padL+'" y="'+padT+'" width="'+plotW+'" height="'+plotH+'" rx="4" class="ugn-plot-bg"/>';

    for (var i=0;i<=4;i++){
      var cv=Math.round(maxC*i/4),gy=yS(cv);
      svg+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" class="ugn-grid"/>';
      svg+='<text x="'+(padL-8)+'" y="'+(gy+4)+'" text-anchor="end" class="ugn-axis-lbl">'+cv+'</text>';
    }
    pts.forEach(function(p){
      svg+='<line x1="'+xS(p.x)+'" y1="'+padT+'" x2="'+xS(p.x)+'" y2="'+(padT+plotH)+'" class="ugn-grid-v"/>';
    });

    if (pts.length>1){
      var areaD='M '+xS(pts[0].x)+' '+(padT+plotH);
      pts.forEach(function(p){areaD+=' L '+xS(p.x)+' '+yS(p.c);});
      areaD+=' L '+xS(pts[pts.length-1].x)+' '+(padT+plotH)+' Z';
      svg+='<defs><linearGradient id="ugn-grad-'+svgId+'" x1="0" y1="0" x2="0" y2="1">'
        +'<stop offset="0%" stop-color="#3b82f6" stop-opacity="0.18"/>'
        +'<stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02"/>'
        +'</linearGradient></defs>';
      svg+='<path d="'+areaD+'" fill="url(#ugn-grad-'+svgId+')"/>';
      var lineD=pts.map(function(p,i){return (i===0?'M':'L')+' '+xS(p.x)+' '+yS(p.c);}).join(' ');
      svg+='<path d="'+lineD+'" class="ugn-curve"/>';
    }

    pts.forEach(function(p,pi){
      var isUser=userNote!=null&&p.x===userNote;
      var cx=xS(p.x),cy=yS(p.c);
      svg+='<circle cx="'+cx+'" cy="'+cy+'" r="12" fill="transparent" class="ugn-hit"'
        +' data-x="'+p.x+'" data-c="'+p.c+'" data-idx="'+pi+'"/>';
      svg+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(isUser?6:4)+'" class="ugn-dot'+(isUser?' ugn-dot-user':'')+'" id="ugn-dot-'+svgId+'-'+pi+'"/>';
    });

    var MIN_GAP=28;
    var labelMask=pts.map(function(){return true;});
    var changed=true;
    while(changed){
      changed=false;
      for(var li=0;li<pts.length-1;li++){
        if(!labelMask[li]) continue;
        var lj=li+1;
        while(lj<pts.length&&!labelMask[lj]) lj++;
        if(lj>=pts.length) break;
        if(xS(pts[lj].x)-xS(pts[li].x)<MIN_GAP){
          if(userNote!=null&&pts[lj].x===userNote) labelMask[li]=false;
          else labelMask[lj]=false;
          changed=true;
        }
      }
    }
    pts.forEach(function(p,i){
      if(!labelMask[i]) return;
      svg+='<text x="'+xS(p.x)+'" y="'+(padT+plotH+14)+'" text-anchor="middle" class="ugn-axis-lbl">'+p.x+'</text>';
    });

    if(classAvg!=null){
      var ax=xS(Math.max(xMin,Math.min(xMax,classAvg)));
      svg+='<line x1="'+ax+'" y1="'+padT+'" x2="'+ax+'" y2="'+(padT+plotH)+'" class="ugn-avg-line"/>';
      svg+='<text x="'+ax+'" y="'+(padT-8)+'" text-anchor="middle" class="ugn-avg-text">moy '+fmt(classAvg)+'</text>';
    }

    if(userNote!=null){
      var ux=xS(Math.max(xMin,Math.min(xMax,userNote)));
      svg+='<line x1="'+ux+'" y1="'+padT+'" x2="'+ux+'" y2="'+(padT+plotH)+'" class="ugn-user-line"/>';
      var userLabelY=padT-8;
      if(classAvg!=null){
        var ax3=xS(Math.max(xMin,Math.min(xMax,classAvg)));
        if(Math.abs(ux-ax3)<60) userLabelY=padT-22;
      }
      svg+='<text x="'+ux+'" y="'+userLabelY+'" text-anchor="middle" class="ugn-user-text">toi ('+userNote+')</text>';
    }

    svg+='<g id="ugn-tip-'+svgId+'" class="ugn-tooltip-g" style="display:none;pointer-events:none">'
      +'<rect id="ugn-tip-bg-'+svgId+'" x="0" y="0" width="110" height="38" rx="6" class="ugn-tip-bg"/>'
      +'<text id="ugn-tip-val-'+svgId+'" x="55" y="15" text-anchor="middle" class="ugn-tip-val"></text>'
      +'<text id="ugn-tip-cnt-'+svgId+'" x="55" y="29" text-anchor="middle" class="ugn-tip-cnt"></text>'
      +'</g>';

    svg+='<text x="'+(padL+plotW/2)+'" y="'+(H-4)+'" text-anchor="middle" class="ugn-axis-title">Note</text>';
    svg+='<text x="12" y="'+(padT+plotH/2)+'" text-anchor="middle" class="ugn-axis-title" transform="rotate(-90,12,'+(padT+plotH/2)+')">Étudiants</text>';
    svg+='</svg>';
    return svg;
  }

  function attachTooltip(svgId) {
    var svgEl = document.getElementById(svgId);
    if (!svgEl) return;
    var tipG   = document.getElementById('ugn-tip-'+svgId);
    var tipBg  = document.getElementById('ugn-tip-bg-'+svgId);
    var tipVal = document.getElementById('ugn-tip-val-'+svgId);
    var tipCnt = document.getElementById('ugn-tip-cnt-'+svgId);
    if (!tipG||!tipVal||!tipCnt) return;

    var TW=110, TH=38, PAD=8;

    svgEl.querySelectorAll('.ugn-hit').forEach(function(el) {
      el.addEventListener('mouseenter', function() {
        var x   = parseFloat(el.getAttribute('data-x'));
        var c   = parseInt(el.getAttribute('data-c'),10);
        var idx = parseInt(el.getAttribute('data-idx'),10);
        var dotEl = document.getElementById('ugn-dot-'+svgId+'-'+idx);
        var cx = parseFloat(dotEl ? dotEl.getAttribute('cx') : el.getAttribute('cx'));
        var cy = parseFloat(dotEl ? dotEl.getAttribute('cy') : el.getAttribute('cy'));

        var vbW=580;
        var tx=cx-TW/2;
        if (tx<PAD) tx=PAD;
        if (tx+TW>vbW-PAD) tx=vbW-PAD-TW;
        var ty=cy-TH-12;
        if (ty<PAD) ty=cy+14;

        tipBg.setAttribute('x',tx); tipBg.setAttribute('y',ty);
        tipBg.setAttribute('width',TW); tipBg.setAttribute('height',TH);
        tipVal.setAttribute('x',tx+TW/2); tipVal.setAttribute('y',ty+15);
        tipCnt.setAttribute('x',tx+TW/2); tipCnt.setAttribute('y',ty+29);
        tipVal.textContent='Note : '+x;
        tipCnt.textContent=c+' étudiant'+(c>1?'s':'');
        tipG.style.display='';
        if (dotEl) dotEl.setAttribute('r','7');
      });
      el.addEventListener('mouseleave', function() {
        tipG.style.display='none';
        var idx=parseInt(el.getAttribute('data-idx'),10);
        var dotEl=document.getElementById('ugn-dot-'+svgId+'-'+idx);
        if (dotEl) dotEl.setAttribute('r', dotEl.classList.contains('ugn-dot-user')?'6':'4');
      });
    });
  }

  var _chartCounter = 0;
  function escClose(e){ if(e.key==='Escape') closeChart(); }
  function closeChart(){
    var o=document.querySelector('.ugn-modal-overlay');
    if(o) o.remove();
    document.removeEventListener('keydown',escClose);
  }

  function openChart(ev) {
    closeChart();
    closeDetail();
    var svgId='ugn-svg-'+(++_chartCounter);
    var overlay=document.createElement('div');
    overlay.className='ugn-modal-overlay';
    overlay.addEventListener('click',function(e){ if(e.target===overlay) closeChart(); });

    var modal=document.createElement('div');
    modal.className='ugn-modal';

    var head=document.createElement('div');
    head.className='ugn-modal-head';
    var title=document.createElement('span');
    title.className='ugn-modal-title';
    title.textContent=ev.label||ev.noteId;
    var closeBtn=document.createElement('button');
    closeBtn.className='ugn-close';
    closeBtn.type='button';
    closeBtn.textContent='×';
    closeBtn.addEventListener('click',closeChart);
    head.appendChild(title);
    head.appendChild(closeBtn);

    var body=document.createElement('div');
    body.className='ugn-modal-body';
    body.innerHTML=curveSVG(ev.values,ev.userNote,ev.classAvg,svgId);

    var foot=document.createElement('div');
    foot.className='ugn-modal-foot';
    foot.textContent='n = '+ev.total+' · moy classe '+fmt(ev.classAvg)
      +(ev.rank!=null?' · ton rang '+ev.rank+'/'+ev.total:'');

    modal.appendChild(head);
    modal.appendChild(body);
    modal.appendChild(foot);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.addEventListener('keydown',escClose);
    setTimeout(function(){ attachTooltip(svgId); }, 0);
  }

  /* ============================================================
   * RESCAN — relance complète après remplacement AJAX du DOM
   * ============================================================ */
  function rescan() {
    document.querySelectorAll('.ugn-badge, .ugn-rank, .ugn-chart-btn').forEach(function(el) {
      el.remove();
    });
    document.querySelectorAll('.ugn-ue-avg').forEach(function(el) { el.remove(); });
    document.querySelectorAll('.ugn-gen-avg').forEach(function(el) { el.remove(); });

    // Réinitialiser les data-attributes "déjà traité"
    document.querySelectorAll('[data-ugn-done]').forEach(function(el) {
      delete el.dataset.ugnDone;
    });
    document.querySelectorAll('[data-ugn-ue]').forEach(function(el) {
      delete el.dataset.ugnUe;
    });
    document.querySelectorAll('[data-ugn-gen]').forEach(function(el) {
      delete el.dataset.ugnGen;
    });

    injectViaBlob();
  }

  /* ============================================================
   * MutationObserver — détecte le rechargement AJAX du tableau
   * ============================================================ */
  var _rescanTimer = null;
  var _observer = new MutationObserver(function(mutations) {
    var relevant = false;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type !== 'childList' || !m.addedNodes.length) continue;
      for (var j = 0; j < m.addedNodes.length; j++) {
        var node = m.addedNodes[j];
        if (node.nodeType !== 1) continue;
        if (node.querySelector && (
          node.querySelector('[id^="note_"]') ||
          node.querySelector('.OrgaUEMin') ||
          node.querySelector('.OrgaUERecap') ||
          node.querySelector('table.OrgaUE')
        )) {
          relevant = true;
          break;
        }
        if (node.id && node.id.indexOf('note_') === 0) {
          relevant = true;
          break;
        }
      }
      if (relevant) break;
    }

    if (!relevant) return;

    if (_rescanTimer) clearTimeout(_rescanTimer);
    _rescanTimer = setTimeout(function() {
      _rescanTimer = null;
      rescan();
    }, 600);
  });

  _observer.observe(document.body, { childList: true, subtree: true });

  injectViaBlob();

})();
