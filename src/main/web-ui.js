/**
 * Pluto Photos — Web Gallery UI
 * Self-contained SPA served by the API server for browser/mobile access.
 */
export function getWebAppHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>Pluto Photos</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}

/* ── Theme Variables ── */
:root, [data-theme="cyber"] {
  --bg-body: #050510;
  --bg-sidebar: #080818;
  --bg-header: #050510;
  --bg-card: #0a0f1e;
  --bg-card-hover: #0e1428;
  --bg-input: #0c1225;
  --bg-hover: #0e1428;
  --bg-active: #0d1a30;
  --border: rgba(0,240,255,.1);
  --border-input: rgba(0,240,255,.15);
  --accent: #00f0ff;
  --accent-dim: rgba(0,240,255,.15);
  --text: #c0c8e0;
  --text-heading: #e0e6ff;
  --text-dim: #7088aa;
  --text-muted: #3a5070;
  --text-section: #3a5070;
  --scrollbar-thumb: rgba(0,240,255,.15);
  --card-shadow: rgba(0,0,0,.6);
  --overlay-bg: rgba(5,5,16,.97);
  --lb-meta-bg: rgba(5,5,16,.8);
  --badge-bg: rgba(5,5,16,.8);
  --name-gradient: linear-gradient(transparent,rgba(5,5,16,.9));
  --danger: #ff4d6a;
  --danger-border: rgba(255,77,106,.2);
  --danger-hover-bg: rgba(255,77,106,.1);
  --danger-hover-border: rgba(255,77,106,.4);
}

[data-theme="dark"] {
  --bg-body: #0a0a0a;
  --bg-sidebar: #0d0d0d;
  --bg-header: #0a0a0a;
  --bg-card: #111;
  --bg-card-hover: #1a1a1a;
  --bg-input: #161616;
  --bg-hover: #141414;
  --bg-active: #161b22;
  --border: #1a1a1a;
  --border-input: #2a2a2a;
  --accent: #58a6ff;
  --accent-dim: rgba(88,166,255,.2);
  --text: #e0e0e0;
  --text-heading: #fff;
  --text-dim: #999;
  --text-muted: #555;
  --text-section: #555;
  --scrollbar-thumb: #222;
  --card-shadow: rgba(0,0,0,.5);
  --overlay-bg: rgba(0,0,0,.95);
  --lb-meta-bg: rgba(0,0,0,.6);
  --badge-bg: rgba(0,0,0,.7);
  --name-gradient: linear-gradient(transparent,rgba(0,0,0,.8));
  --danger: #f85149;
  --danger-border: rgba(248,81,73,.2);
  --danger-hover-bg: rgba(248,81,73,.1);
  --danger-hover-border: rgba(248,81,73,.4);
}

[data-theme="light"] {
  --bg-body: #f5f5f7;
  --bg-sidebar: #ffffff;
  --bg-header: #f5f5f7;
  --bg-card: #fff;
  --bg-card-hover: #f0f0f2;
  --bg-input: #f0f0f2;
  --bg-hover: #f0f0f2;
  --bg-active: #e8f0fe;
  --border: #d1d1d6;
  --border-input: #c7c7cc;
  --accent: #0078d4;
  --accent-dim: rgba(0,120,212,.12);
  --text: #1d1d1f;
  --text-heading: #000;
  --text-dim: #6e6e73;
  --text-muted: #aeaeb2;
  --text-section: #aeaeb2;
  --scrollbar-thumb: rgba(0,0,0,.15);
  --card-shadow: rgba(0,0,0,.08);
  --overlay-bg: rgba(255,255,255,.95);
  --lb-meta-bg: rgba(255,255,255,.85);
  --badge-bg: rgba(0,0,0,.6);
  --name-gradient: linear-gradient(transparent,rgba(0,0,0,.5));
  --danger: #ff3b30;
  --danger-border: rgba(255,59,48,.2);
  --danger-hover-bg: rgba(255,59,48,.08);
  --danger-hover-border: rgba(255,59,48,.4);
}

body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg-body);color:var(--text)}

/* ── Layout ── */
#app{display:flex;height:100vh;overflow:hidden}

/* ── Sidebar ── */
#sidebar{width:280px;background:var(--bg-sidebar);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;transition:transform .25s ease;z-index:100}
#sidebar .brand{padding:20px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
#sidebar .brand h1{font-size:13px;font-weight:800;color:var(--text-heading);letter-spacing:.5px;text-transform:uppercase}
.brand-logo{width:32px;height:32px;border-radius:6px;object-fit:contain}
#sidebar-nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 0;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
#sidebar-nav::-webkit-scrollbar{width:4px}
#sidebar-nav::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:4px}
#nav-inner{pointer-events:auto}
#sidebar-footer{padding:12px 16px;border-top:1px solid var(--border);flex-shrink:0}
#logout-btn{width:100%;background:transparent;color:var(--danger);border:1px solid var(--danger-border);padding:8px;border-radius:6px;cursor:pointer;font-size:12px;transition:all .2s}
#logout-btn:hover{background:var(--danger-hover-bg);border-color:var(--danger-hover-border)}

/* Theme toggle */
.theme-toggle{display:flex;gap:4px;margin-bottom:10px;background:var(--bg-input);border-radius:8px;padding:3px;border:1px solid var(--border)}
.theme-btn{flex:1;padding:6px 0;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;background:transparent;color:var(--text-dim);transition:all .2s}
.theme-btn.active{background:var(--accent);color:#fff}
.theme-btn:hover:not(.active){background:var(--bg-hover);color:var(--text)}

.nav-section{padding:18px 16px 6px;font-size:10px;font-weight:700;color:var(--text-section);letter-spacing:1.2px}
.nav-item{padding:10px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;color:var(--text-dim);font-size:13px;font-weight:500;border-left:3px solid transparent}
.nav-item:hover{background:var(--bg-hover);color:var(--text-heading)}
.nav-item.active{background:var(--bg-active);color:var(--accent);border-left-color:var(--accent)}
.nav-item .icon{font-size:16px;width:22px;text-align:center;flex-shrink:0}
.nav-item .label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-item .count{font-size:10px;color:var(--text-muted);background:rgba(255,255,255,.05);padding:2px 6px;border-radius:4px}

.project-hdr{padding:8px 16px;display:flex;align-items:center;gap:8px;cursor:pointer}
.project-hdr .chevron{font-size:9px;color:var(--text-muted);transition:transform .2s}
.project-hdr .chevron.collapsed{transform:rotate(-90deg)}
.project-hdr:hover{background:rgba(255,255,255,.03)}
.project-hdr:hover .pname{color:var(--text)}
.project-hdr .pname{font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.album-item{padding:8px 16px 8px 28px;display:flex;align-items:center;gap:10px;cursor:pointer;color:var(--text-dim);font-size:13px;font-weight:500;border-left:3px solid transparent}
.album-item:hover{background:var(--bg-hover);color:var(--text-heading)}
.album-item.active{background:var(--bg-active);color:var(--accent);border-left-color:var(--accent)}
.album-thumb{width:48px;height:48px;border-radius:6px;background:var(--bg-card-hover);border:1px solid var(--border);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.album-thumb img{width:100%;height:100%;object-fit:cover}
.album-thumb .placeholder{font-size:18px;opacity:.3}
.album-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.album-count{font-size:10px;color:var(--text-muted)}
.album-item.drop-target{background:var(--accent);color:#fff;border-left-color:var(--accent);outline:2px solid var(--accent);outline-offset:-2px;transition:background .15s}
.album-item.drop-target .album-label{color:#fff}
.album-item.drop-target .album-count{color:rgba(255,255,255,.7)}
.card[draggable=true]{cursor:grab}
.card[draggable=true]:active{cursor:grabbing}

/* ── Main content ── */
#main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}

/* Header bar */
#header{border-bottom:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;background:var(--bg-header)}
#menu-btn{display:none;background:none;border:none;color:var(--text-heading);font-size:22px;cursor:pointer;padding:4px 8px}
.header-top{display:flex;align-items:center;gap:12px;padding:10px 16px 4px;flex-wrap:wrap}
.header-left{display:flex;align-items:baseline;gap:8px;min-width:0;flex-grow:1;overflow:hidden}
#header h2{font-size:15px;font-weight:700;color:var(--text-heading);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item-count{font-size:12px;color:var(--text-muted);margin:0;white-space:nowrap}
.selection-tag{display:inline-block;background:var(--accent);color:#000;padding:1px 7px;border-radius:6px;font-size:10px;font-weight:700;margin-left:6px}
.header-controls{display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap}
#search-input{background:var(--bg-input);border:1px solid var(--border-input);border-radius:6px;padding:6px 12px;color:var(--text);font-size:12px;width:180px;outline:none;transition:border-color .2s}
#search-input:focus{border-color:var(--accent)}
#sort-select{background:var(--bg-input);border:1px solid var(--border-input);border-radius:6px;padding:6px 10px;color:var(--text);font-size:12px;outline:none;cursor:pointer}
.slider-wrapper{display:flex;align-items:center;gap:6px}
.slider-label{font-size:11px;color:var(--text-muted);white-space:nowrap}
.thumb-slider{width:80px;height:4px;appearance:none;-webkit-appearance:none;background:var(--bg-input);border-radius:2px;accent-color:var(--accent);cursor:pointer}
.header-hr{border:none;border-top:1px solid var(--border);margin:6px 16px}

/* Toolbar row */
.toolbar-row{display:flex;align-items:center;justify-content:center;padding:2px 16px 6px;flex-wrap:wrap;gap:2px 1px}
.toolbar-sep{width:1px;height:18px;background:var(--border);margin:0 6px;flex-shrink:0}
.tool-btn{position:relative;display:flex;align-items:center;gap:5px;padding:5px 10px;background:transparent;border:1px solid transparent;border-radius:6px;color:var(--text-dim);cursor:pointer;white-space:nowrap;font-size:12px;transition:all .15s}
.tool-btn:hover{background:var(--bg-hover);border-color:var(--border);color:var(--text-heading)}
.tool-btn:active{background:rgba(255,255,255,.1);transform:scale(.96)}
.tool-btn.locked{opacity:.4}
.tool-btn.locked:hover{opacity:.6}
.tool-label{font-weight:500;letter-spacing:.01em}
.pro-pip{font-size:7px;font-weight:800;letter-spacing:.5px;padding:1px 4px;border-radius:3px;background:rgba(191,90,242,.2);color:#bf5af2;line-height:1.3;position:absolute;top:-1px;right:-1px}

/* ── Gallery grid ── */
#gallery{flex:1;overflow-y:auto;padding:12px}
#gallery::-webkit-scrollbar{width:6px}
#gallery::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.card{position:relative;border-radius:8px;overflow:hidden;background:var(--bg-card);cursor:pointer;aspect-ratio:1;transition:transform .15s,box-shadow .15s}
.card:hover{transform:scale(1.02);box-shadow:0 4px 20px var(--card-shadow)}
.card img,.card video{width:100%;height:100%;object-fit:cover;display:block}
.card .badge{position:absolute;top:6px;right:6px;background:var(--badge-bg);color:#fff;font-size:9px;font-weight:700;padding:3px 6px;border-radius:4px;letter-spacing:.5px;text-transform:uppercase}
.card .name-overlay{position:absolute;bottom:0;left:0;right:0;padding:6px 8px;background:var(--name-gradient);font-size:11px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0;transition:opacity .2s}
.card:hover .name-overlay{opacity:1}

/* ── Locked card (free tier limit) ── */
.card.locked{cursor:default;pointer-events:auto}
.card.locked:hover{transform:none;box-shadow:none}
.card.locked img,.card.locked video{filter:blur(10px) brightness(0.6);pointer-events:none}
.card.locked .name-overlay{display:none}
.card.locked .badge{display:none}
.card.locked .selection-indicator{display:none}
.locked-overlay{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;pointer-events:none}
.locked-overlay .lock-icon-svg{width:28px;height:28px;color:rgba(255,255,255,0.85);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5))}
.locked-overlay .lock-text{font-size:10px;font-weight:600;color:rgba(255,255,255,0.85);text-shadow:0 1px 3px rgba(0,0,0,0.6);letter-spacing:.3px}
.card.locked .selected-check{display:none}

/* ── In-album indicator on cards ── */
.card.in-album{opacity:0.4;position:relative}
.card.in-album:hover{opacity:0.7}
.card .album-badge{position:absolute;bottom:6px;right:6px;z-index:10;font-size:10px;font-weight:600;color:#fff;background:rgba(0,120,212,0.7);padding:2px 6px;border-radius:4px;letter-spacing:.3px;pointer-events:none}

/* Loading / empty */
.loading,.empty-state{display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted);font-size:14px}
.spinner{width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin-right:10px}
@keyframes spin{to{transform:rotate(360deg)}}

#load-more{display:block;margin:20px auto;padding:10px 24px;background:var(--bg-input);border:1px solid var(--border-input);color:var(--text-dim);border-radius:6px;cursor:pointer;font-size:13px}
#load-more:hover{background:var(--bg-hover);color:var(--text-heading)}

/* ── Lightbox ── */
#lightbox{position:fixed;inset:0;background:var(--overlay-bg);z-index:1000;display:none;flex-direction:column;align-items:center;justify-content:center}
#lightbox.open{display:flex}
#lightbox.above-overlay{z-index:2200}
#lb-close{position:absolute;top:16px;right:20px;background:none;border:none;color:var(--text-heading);font-size:28px;cursor:pointer;z-index:10;padding:8px;opacity:.7;transition:opacity .2s}
#lb-close:hover{opacity:1}
#lb-prev,#lb-next{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.1);border:none;color:#fff;font-size:24px;cursor:pointer;padding:16px 12px;border-radius:8px;opacity:.5;transition:opacity .2s;z-index:10}
#lb-prev:hover,#lb-next:hover{opacity:1;background:rgba(255,255,255,.15)}
#lb-prev{left:12px}
#lb-next{right:12px}
#lb-content{max-width:95vw;max-height:85vh;display:flex;align-items:center;justify-content:center}
#lb-content img{max-width:95vw;max-height:85vh;object-fit:contain;border-radius:4px}
#lb-content video{max-width:95vw;max-height:85vh;border-radius:4px}
#lb-info{position:absolute;bottom:16px;color:var(--text-dim);font-size:13px;text-align:center}
#lb-meta{position:absolute;top:16px;left:20px;color:var(--text-dim);font-size:12px;z-index:10;background:var(--lb-meta-bg);padding:8px 12px;border-radius:6px;display:none}
#lb-meta.show{display:block}
#lb-meta div{margin:2px 0}

/* ── Mobile overlay ── */
#sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:90}

/* Light theme special overrides */
[data-theme="light"] .card .name-overlay{color:#333}
[data-theme="light"] .nav-item .count{background:rgba(0,0,0,.05)}
[data-theme="light"] #lb-prev,[data-theme="light"] #lb-next{background:rgba(0,0,0,.2);color:#333}
[data-theme="light"] #lb-prev:hover,[data-theme="light"] #lb-next:hover{background:rgba(0,0,0,.35)}
[data-theme="light"] #lb-close{color:#333}
[data-theme="cyber"] .theme-btn.active{background:linear-gradient(135deg,#00f0ff,#a855f7);color:#000}

/* ── Slideshow ── */
#slideshow{position:fixed;inset:0;background:#000;z-index:2000;display:none;align-items:center;justify-content:center;flex-direction:column}
#slideshow.open{display:flex}
.ss-layer img,.ss-layer video{max-width:100vw;max-height:100vh}
#ss-close{position:absolute;top:16px;right:20px;background:none;border:none;color:#fff;font-size:28px;cursor:pointer;z-index:10;opacity:.7;transition:opacity .2s}
#ss-close:hover{opacity:1}
#ss-progress{position:absolute;bottom:0;left:0;height:3px;background:var(--accent);transition:width .3s linear}
#ss-counter{position:absolute;bottom:14px;right:20px;color:rgba(255,255,255,.5);font-size:12px}
#ss-pause{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.1);border:none;color:#fff;font-size:14px;cursor:pointer;padding:6px 16px;border-radius:6px;opacity:.6;transition:opacity .2s}
#ss-pause:hover{opacity:1}

/* ── Slideshow button ── */
.slideshow-btn{background:var(--bg-input);border:1px solid var(--border-input);color:var(--text-dim);border-radius:6px;padding:7px 12px;cursor:pointer;font-size:12px;font-weight:500;transition:all .2s;display:flex;align-items:center;gap:5px;white-space:nowrap}
.slideshow-btn:hover{background:var(--bg-hover);color:var(--text-heading);border-color:var(--accent)}

/* ── Right Gallery Sidebar ── */
#content-area{flex:1;display:flex;overflow:hidden;min-width:0}
#gallery-col{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
#right-sidebar{width:280px;background:var(--bg-sidebar);border-left:1px solid var(--border);display:flex;flex-direction:column;height:100%;overflow-y:auto;flex-shrink:0;transition:width .2s}
#right-sidebar::-webkit-scrollbar{width:4px}
#right-sidebar::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:4px}
.rsb-section{display:flex;flex-direction:column;gap:12px;padding:20px 16px}

/* Empty state */
.rsb-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:32px 8px;gap:4px}
.rsb-empty-icon{color:var(--text-muted);opacity:.3;margin-bottom:8px;font-size:40px}
.rsb-empty-title{font-size:16px;font-weight:600;color:var(--text-heading);margin:0}
.rsb-empty-hint{font-size:12px;color:var(--text-muted);margin:4px 0 0}
.rsb-stats{background:var(--bg-card);border-radius:10px;padding:14px 20px;margin-top:20px;width:100%;text-align:center}
.rsb-stat-val{font-size:22px;font-weight:700;color:var(--accent)}
.rsb-stat-label{font-size:12px;color:var(--text-muted);margin-left:6px}
.rsb-tips{margin-top:24px;text-align:left;width:100%}
.rsb-tip{font-size:11px;color:var(--text-muted);margin:8px 0;line-height:1.5}
.rsb-tip kbd{background:var(--bg-card);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:10px;font-family:inherit}

/* License info card */
.rsb-license{background:var(--bg-card);border-radius:10px;padding:14px 16px;margin-top:20px;width:100%;display:flex;align-items:center;gap:10px}
.rsb-badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.rsb-badge-free{background:rgba(255,255,255,.08);color:var(--text-muted)}
.rsb-badge-trial{background:linear-gradient(135deg,rgba(0,113,227,.2),rgba(88,86,214,.2));color:#6cb4ff}
.rsb-badge-pro{background:linear-gradient(135deg,rgba(0,113,227,.25),rgba(88,86,214,.25));color:#a78bfa}

/* Trial CTA */
.rsb-trial{position:relative;width:100%;margin-top:24px;border-radius:14px;border:1px solid rgba(168,85,247,.25);background:var(--bg-card);overflow:hidden}
.rsb-trial-glow{position:absolute;top:-40px;left:50%;transform:translateX(-50%);width:200px;height:100px;background:radial-gradient(ellipse,rgba(168,85,247,.2),transparent 70%);pointer-events:none}
.rsb-trial-content{position:relative;padding:20px 16px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px}
.rsb-trial-icon{font-size:28px}
.rsb-trial-title{font-size:15px;font-weight:700;margin:0;background:linear-gradient(135deg,#a78bfa,#60a5fa);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.rsb-trial-sub{font-size:11px;color:var(--text-muted);margin:0 0 4px}
.rsb-trial-feats{display:flex;flex-wrap:wrap;gap:4px 8px;justify-content:center;margin:6px 0 10px}
.rsb-trial-feat{font-size:10px;color:rgba(167,139,250,.8);font-weight:500}
.rsb-trial-form{width:100%;display:flex;flex-direction:column;gap:8px}
.rsb-trial-input{padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--text);font-size:13px;outline:none;transition:border-color .2s}
.rsb-trial-input:focus{border-color:rgba(168,85,247,.5)}
.rsb-trial-input::placeholder{color:var(--text-muted);opacity:.6}
.rsb-trial-btn{width:100%;padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#a855f7,#6366f1);color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px}
.rsb-trial-btn:hover:not(:disabled){filter:brightness(1.1);transform:translateY(-1px)}
.rsb-trial-btn:disabled{opacity:.5;cursor:not-allowed}
.rsb-trial-fine{font-size:10px;color:var(--text-muted);opacity:.6;margin:6px 0 0}
.rsb-trial-success{display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0}
.rsb-trial-success-msg{font-size:12px;color:#4ade80;font-weight:500;margin:0}
.rsb-trial-error{font-size:11px;color:var(--danger);margin:4px 0 0}

/* Single selection metadata */
.rsb-meta-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);margin:0}
.rsb-file-name{font-size:18px;font-weight:600;line-height:1.3;color:var(--text-heading);margin:8px 0 16px;word-break:break-all}
.rsb-meta-list{background:var(--bg-card);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px}
.rsb-meta-row{display:flex;justify-content:space-between;align-items:center;font-size:12px}
.rsb-meta-key{color:var(--text-muted)}
.rsb-meta-val{color:var(--text);font-weight:500;text-align:right}

/* Multi select */
.rsb-multi{display:flex;flex-direction:column;align-items:center;gap:8px;padding:24px 0}
.rsb-multi-icon{font-size:32px;opacity:.6}
.rsb-multi-title{font-size:18px;font-weight:600;margin:0;color:var(--text-heading)}

/* Action buttons */
.rsb-actions{padding:16px;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--border)}
.rsb-btn{width:100%;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);transition:all .15s;letter-spacing:.01em}
.rsb-btn:hover{color:var(--text-heading);background:var(--bg-hover);border-color:rgba(255,255,255,.14)}
.rsb-btn:active{transform:scale(.98)}
.rsb-btn-batch{background:rgba(0,113,227,.06);color:var(--accent);border-color:rgba(0,113,227,.15)}
.rsb-btn-batch:hover{background:rgba(0,113,227,.12);border-color:rgba(0,113,227,.3)}
.rsb-btn-edit{background:var(--bg-card);color:var(--text-muted)}
.rsb-btn-edit:hover{color:var(--text-heading)}
.rsb-btn-export{background:var(--bg-card);color:var(--text-muted)}
.rsb-btn-export:hover{color:var(--text-heading)}
.rsb-btn-danger{background:transparent;color:var(--danger);border-color:var(--danger-border)}
.rsb-btn-danger:hover{background:var(--danger-hover-bg);border-color:var(--danger-hover-border)}
.rsb-btn-locked{opacity:.45;position:relative}
.rsb-btn-locked:hover{opacity:.6}
.rsb-btn-outline{background:transparent;color:var(--text-muted);border:1px solid var(--border)}
.rsb-btn-outline:hover{background:var(--bg-hover);color:var(--text-heading)}
.rsb-btn .lock-label{margin-left:6px;font-size:12px}

/* ── Image Editor Overlay ── */
#editor-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:8000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
.editor-panel{width:95vw;height:92vh;max-width:1400px;background:var(--bg-sidebar);border-radius:14px;border:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.editor-header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border);background:var(--bg-card)}
.editor-header h2{font-size:16px;color:var(--text-heading);font-weight:600;margin:0}
.editor-filename{font-size:12px;color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.editor-tools{display:flex;gap:4px}
.editor-hdr-btn{background:var(--bg-input);border:1px solid var(--border);color:var(--text-muted);width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}
.editor-hdr-btn:hover:not(:disabled){background:var(--bg-hover);color:var(--text-heading)}
.editor-hdr-btn:disabled{opacity:.3;cursor:default}
.editor-close{background:none;border:none;color:var(--text-muted);font-size:22px;cursor:pointer;padding:4px 8px;border-radius:6px}
.editor-close:hover{background:var(--bg-hover);color:var(--text-heading)}
.editor-body{flex:1;display:flex;overflow:hidden}
.editor-canvas-area{flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg);position:relative;overflow:hidden}
.editor-canvas-area.checkerboard{background:repeating-conic-gradient(#808080 0% 25%,#c0c0c0 0% 50%) 50%/20px 20px}
.editor-canvas-area canvas{max-width:100%;max-height:100%;object-fit:contain}
#editor-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.5);color:#fff;gap:12px;z-index:2}
.editor-controls{width:280px;overflow-y:auto;border-left:1px solid var(--border);padding:16px;display:flex;flex-direction:column;gap:16px;flex-shrink:0}
.editor-section h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin:0 0 10px}
.editor-section h3 .pro-tag{background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-size:9px;padding:2px 6px;border-radius:4px;vertical-align:middle;font-weight:700;margin-left:6px}
.editor-quick-actions{display:flex;gap:6px;flex-wrap:wrap}
.editor-tool-btn{width:42px;height:42px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.editor-tool-btn:hover{background:var(--bg-hover);color:var(--text-heading);border-color:var(--accent)}
.editor-tool-btn.active{background:rgba(0,113,227,.15);color:var(--accent);border-color:var(--accent)}
.editor-slider-group{margin-bottom:12px}
.editor-slider-group label{font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;margin-bottom:4px}
.editor-slider{width:100%;height:4px;-webkit-appearance:none;appearance:none;border-radius:4px;background:var(--bg-input);outline:none}
.editor-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--accent);cursor:pointer;border:2px solid var(--bg-sidebar)}
.editor-action-btn{width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);cursor:pointer;font-size:13px;font-weight:500;transition:all .15s}
.editor-action-btn:hover{background:var(--bg-hover);color:var(--text-heading)}
.editor-action-btn:disabled{opacity:.4;cursor:default}
.editor-primary{background:var(--accent)!important;color:#fff!important;border-color:var(--accent)!important;font-weight:600}
.editor-primary:hover{filter:brightness(1.1)}
.editor-pro-hint{font-size:11px;color:var(--text-muted);margin:6px 0 0}
.editor-filter-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.editor-filter-chip{padding:8px 4px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);cursor:pointer;text-align:center;font-size:11px;color:var(--text-muted);transition:all .15s}
.editor-filter-chip:hover{background:var(--bg-hover);color:var(--text-heading)}
.editor-filter-chip.active{border-color:var(--accent);color:var(--accent);background:rgba(0,113,227,.1)}
.editor-filter-chip .filter-icon{display:block;font-size:18px;margin-bottom:2px}
.editor-filter-chip .filter-label{display:block;font-size:10px}
@media(max-width:768px){.editor-panel{width:100vw;height:100vh;border-radius:0}.editor-controls{width:220px}}
@media(max-width:580px){.editor-body{flex-direction:column}.editor-controls{width:100%;max-height:40vh;border-left:none;border-top:1px solid var(--border)}}

/* Detail panel in right sidebar (rating/tags/colors) */
.rsb-detail-section{margin-top:16px}
.rsb-detail-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);margin-bottom:8px}
.rsb-rating-stars{display:flex;gap:2px;font-size:20px;cursor:pointer}
.rsb-rating-stars .star{color:var(--text-muted);cursor:pointer;transition:color .1s}
.rsb-rating-stars .star.filled,.rsb-rating-stars .star.hover{color:#fbbf24}
.rsb-color-dots{display:flex;gap:6px;padding:4px 0}
.rsb-color-dot{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .15s}
.rsb-color-dot:hover{transform:scale(1.2)}
.rsb-color-dot.active{border-color:var(--text-heading);box-shadow:0 0 0 2px var(--bg-sidebar)}
.rsb-tag-list{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.rsb-tag-chip{background:rgba(255,255,255,.08);padding:3px 8px;border-radius:4px;font-size:11px;color:var(--text-dim);display:flex;align-items:center;gap:4px}
.rsb-tag-chip .remove-tag{cursor:pointer;opacity:.5;font-size:9px}
.rsb-tag-chip .remove-tag:hover{opacity:1;color:var(--danger)}
.rsb-tag-row{display:flex;gap:4px}
.rsb-tag-input{flex:1;background:var(--bg-input);border:1px solid var(--border-input);border-radius:4px;padding:6px 8px;color:var(--text);font-size:12px;outline:none}
.rsb-tag-input:focus{border-color:var(--accent)}
.rsb-tag-add{background:var(--accent);color:#000;border:none;border-radius:4px;padding:6px 10px;cursor:pointer;font-size:12px;font-weight:700}
.rsb-album-chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.rsb-album-chip{background:rgba(255,255,255,.08);padding:3px 8px;border-radius:4px;font-size:11px;color:var(--text-dim);display:flex;align-items:center;gap:4px}
.rsb-album-chip .remove-album{cursor:pointer;opacity:.5;font-size:9px}
.rsb-album-chip .remove-album:hover{opacity:1;color:var(--danger)}

/* ── Slideshow enhancements ── */
#ss-prev,#ss-next{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.08);border:none;color:#fff;font-size:32px;cursor:pointer;padding:12px 16px;border-radius:8px;opacity:0;transition:opacity .3s;z-index:10}
#slideshow.open:hover #ss-prev,#slideshow.open:hover #ss-next{opacity:.5}
#ss-prev:hover,#ss-next:hover{opacity:1!important;background:rgba(255,255,255,.15)}
#ss-prev{left:16px}
#ss-next{right:16px}
#ss-info{position:absolute;bottom:40px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.7);font-size:13px;text-align:center;background:rgba(0,0,0,.5);padding:6px 14px;border-radius:6px;display:none;z-index:10;max-width:80vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ss-info.visible{display:block}
#ss-gear{position:absolute;top:16px;left:20px;background:rgba(255,255,255,.1);border:none;color:#fff;font-size:18px;cursor:pointer;padding:8px 10px;border-radius:8px;opacity:.5;transition:opacity .2s;z-index:10}
#ss-gear:hover{opacity:1}
#ss-content{position:relative;width:100vw;height:100vh;overflow:hidden}
.ss-layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0}
.ss-layer.active{opacity:1}
.ss-layer.fade{transition:opacity .6s ease}
.ss-layer.slide-enter{animation:ssSlideIn .5s ease forwards}
.ss-layer.slide-exit{animation:ssSlideOut .5s ease forwards}
@keyframes ssSlideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes ssSlideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(-100%);opacity:0}}
@keyframes ssKenBurns{0%{transform:scale(1)}100%{transform:scale(1.06)}}
.ss-layer.zoom img,.ss-layer.zoom video{animation:ssKenBurns var(--ss-dur,4s) ease-in-out forwards}
#ss-settings-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:3000;display:none;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
#ss-settings-overlay.open{display:flex}
#ss-settings{background:#1e1e2e;border-radius:14px;padding:28px 32px;max-width:420px;width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.08);color:#e0e0e0;max-height:85vh;overflow-y:auto}
#ss-settings h3{margin:0 0 20px;font-size:17px;font-weight:600;color:#fff;display:flex;align-items:center;justify-content:space-between}
#ss-settings h3 button{background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;padding:4px 8px}
#ss-settings h3 button:hover{color:#fff}
.ss-group{margin-bottom:18px}
.ss-group-label{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,.35);margin-bottom:8px;font-weight:600}
.ss-pills{display:flex;gap:6px;flex-wrap:wrap}
.ss-pill{padding:6px 14px;border-radius:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);cursor:pointer;font-size:13px;transition:all .2s;user-select:none}
.ss-pill:hover{background:rgba(255,255,255,.1);color:#fff}
.ss-pill.active{background:var(--accent);color:black;border-color:var(--accent);font-weight:500}
.ss-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0}
.ss-toggle-row span{font-size:14px;color:rgba(255,255,255,.8)}
.ss-switch{position:relative;display:inline-block;width:40px;height:22px}
.ss-switch input{opacity:0;width:0;height:0}
.ss-switch .slider{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,.15);border-radius:11px;transition:.2s}
.ss-switch .slider:before{content:'';position:absolute;height:16px;width:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}
.ss-switch input:checked+.slider{background:var(--accent)}
.ss-switch input:checked+.slider:before{transform:translateX(18px)}
#ss-start-btn{width:100%;margin-top:8px;padding:12px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px}
#ss-start-btn:hover{filter:brightness(1.15);transform:translateY(-1px)}

/* ── Download button in lightbox ── */
#lb-download{position:absolute;top:16px;right:56px;background:rgba(255,255,255,.1);border:none;color:#fff;font-size:15px;cursor:pointer;padding:8px 12px;border-radius:8px;opacity:.6;transition:opacity .2s;z-index:10;text-decoration:none;display:flex;align-items:center;gap:6px}
#lb-download:hover{opacity:1;background:rgba(255,255,255,.15)}
#lb-download span{font-size:12px;font-weight:500}

/* ── People grid ── */
.people-grid{padding:8px 12px;display:flex;flex-direction:column;gap:4px}
.person-card{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;border:1px solid transparent;min-width:0}
.person-card:hover{background:var(--bg-hover);border-color:var(--border)}
.person-card.active{background:var(--bg-active);border-color:var(--accent)}
.person-avatar{width:36px;height:36px;border-radius:50%;background:var(--bg-card-hover);border:1px solid var(--border);overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px}
.person-avatar img{width:100%;height:100%;object-fit:cover}
.person-name{font-size:12px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.person-count{font-size:10px;color:var(--text-muted)}

/* ── Responsive ── */
@media(max-width:768px){
  #sidebar{position:fixed;left:0;top:0;bottom:0;transform:translateX(-100%);background:var(--bg-sidebar)}
  #sidebar.open{transform:translateX(0)}
  #sidebar-overlay.open{display:block}
  #menu-btn{display:block}
  .grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px}
  #gallery{padding:8px}
  #search-input{width:140px}
  #right-sidebar{display:none}
  .tool-label{display:none}
  .tool-btn{padding:6px 8px}
  .slider-wrapper{display:none}
}
@media(max-width:480px){
  .grid{grid-template-columns:repeat(3,1fr);gap:4px}
  #search-input{width:120px;font-size:12px;padding:6px 8px}
  .card{border-radius:4px}
  .toolbar-row{display:none}
}

/* ── Detail Panel ── */
#lb-detail{position:absolute;top:0;right:0;bottom:0;width:320px;background:var(--bg-sidebar);border-left:1px solid var(--border);z-index:20;transform:translateX(100%);transition:transform .25s ease;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
#lb-detail.open{transform:translateX(0)}
#lb-detail-toggle{position:absolute;top:16px;right:96px;background:rgba(255,255,255,.1);border:none;color:#fff;font-size:14px;cursor:pointer;padding:8px 12px;border-radius:8px;opacity:.6;transition:opacity .2s;z-index:10}
#lb-detail-toggle:hover{opacity:1}
#lb-detail-toggle.active{opacity:1;background:var(--accent);color:#000}
.detail-section{margin-bottom:4px}
.detail-label{font-size:10px;font-weight:700;color:var(--text-section);letter-spacing:.8px;text-transform:uppercase;margin-bottom:6px}
.rating-stars{display:flex;gap:2px;cursor:pointer}
.rating-stars .star{font-size:22px;color:var(--text-muted);transition:color .15s;user-select:none}
.rating-stars .star.filled{color:#fbbf24}
.rating-stars .star:hover,.rating-stars .star.hover{color:#fbbf24}
.color-labels{display:flex;gap:6px;flex-wrap:wrap}
.color-dot{width:24px;height:24px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .15s}
.color-dot:hover{transform:scale(1.2)}
.color-dot.active{border-color:var(--text-heading);box-shadow:0 0 0 2px var(--bg-body)}
.tag-list{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.tag-chip{display:inline-flex;align-items:center;gap:4px;background:var(--accent-dim);color:var(--accent);padding:4px 8px;border-radius:4px;font-size:11px;font-weight:500}
.tag-chip .remove-tag{cursor:pointer;opacity:.6;font-size:13px;line-height:1}
.tag-chip .remove-tag:hover{opacity:1}
.tag-input-row{display:flex;gap:4px}
.tag-input{flex:1;background:var(--bg-input);border:1px solid var(--border-input);border-radius:4px;padding:6px 8px;color:var(--text);font-size:12px;outline:none}
.tag-input:focus{border-color:var(--accent)}
.tag-add-btn{background:var(--accent);color:#000;border:none;border-radius:4px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer}
.album-chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.album-chip{display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,.06);color:var(--text-dim);padding:4px 8px;border-radius:4px;font-size:11px}
.album-chip .remove-album{cursor:pointer;opacity:.6;font-size:13px}
.album-chip .remove-album:hover{opacity:1;color:var(--danger)}
.add-to-album-btn{background:var(--bg-input);border:1px solid var(--border-input);color:var(--text-dim);border-radius:4px;padding:6px 10px;font-size:11px;cursor:pointer;transition:all .15s}
.add-to-album-btn:hover{background:var(--bg-hover);color:var(--text-heading);border-color:var(--accent)}

/* ── Modal ── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:5000;display:none;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
.modal-overlay.open{display:flex}
.modal-box{background:var(--bg-sidebar);border:1px solid var(--border);border-radius:14px;padding:24px 28px;max-width:480px;width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:85vh;overflow-y:auto}
.modal-box h3{font-size:16px;font-weight:700;color:var(--text-heading);margin-bottom:16px;display:flex;align-items:center;justify-content:space-between}
.modal-box h3 button{background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px 8px}
.modal-box h3 button:hover{color:var(--text)}
.modal-field{margin-bottom:14px}
.modal-field label{display:block;font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}
.modal-field input,.modal-field select,.modal-field textarea{width:100%;background:var(--bg-input);border:1px solid var(--border-input);border-radius:8px;padding:10px 12px;color:var(--text);font-size:13px;outline:none}
.modal-field input:focus,.modal-field select:focus{border-color:var(--accent)}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.modal-btn{padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all .2s}
.modal-btn-primary{background:var(--accent);color:#000}
.modal-btn-primary:hover{filter:brightness(1.15)}
.modal-btn-secondary{background:transparent;color:var(--text-dim);border:1px solid var(--border)}
.modal-btn-secondary:hover{background:var(--bg-hover);color:var(--text)}
.modal-btn-danger{background:transparent;color:var(--danger);border:1px solid var(--danger-border)}
.modal-btn-danger:hover{background:var(--danger-hover-bg);border-color:var(--danger-hover-border)}
.sa-rules{display:flex;flex-direction:column;gap:8px}
.sa-rule{display:flex;gap:6px;align-items:center}
.sa-rule select,.sa-rule input{flex:1}
.sa-rule .remove-rule{background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:4px}
.add-rule-btn{background:var(--bg-input);border:1px dashed var(--border-input);color:var(--text-dim);border-radius:6px;padding:8px;font-size:12px;cursor:pointer;text-align:center;transition:all .15s}
.add-rule-btn:hover{border-color:var(--accent);color:var(--accent)}

/* ── Context Menu ── */
.ctx-menu{position:fixed;background:var(--bg-sidebar);border:1px solid var(--border);border-radius:10px;padding:6px 0;min-width:200px;z-index:6000;box-shadow:0 8px 30px rgba(0,0,0,.5);display:none}
.ctx-menu.open{display:block}
.ctx-item{padding:8px 14px;font-size:13px;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:8px}
.ctx-item:hover{background:var(--bg-hover);color:var(--text-heading)}
.ctx-item.danger{color:var(--danger)}
.ctx-item.danger:hover{background:var(--danger-hover-bg)}
.ctx-sep{height:1px;background:var(--border);margin:4px 8px}

/* ── Toast ── */
.toast-container{position:fixed;bottom:20px;right:20px;z-index:9000;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.toast{background:var(--bg-sidebar);border:1px solid var(--border);border-radius:8px;padding:10px 16px;font-size:13px;color:var(--text);box-shadow:0 4px 20px rgba(0,0,0,.4);animation:toastIn .3s ease;pointer-events:auto;max-width:360px}
.toast.error{border-color:var(--danger-border);color:var(--danger)}
.toast.success{border-color:rgba(34,197,94,.3);color:#22c55e}
@keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes toastOut{from{opacity:1}to{opacity:0;transform:translateY(10px)}}

/* ── Batch Selection ── */
.card.selected{outline:3px solid var(--accent);outline-offset:-3px;transform:scale(1.02);box-shadow:0 0 0 3px var(--accent),0 4px 20px var(--card-shadow)}
.card.selected::after{content:'\\2713';position:absolute;top:6px;left:6px;background:var(--accent);color:#000;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;z-index:2;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.batch-bar{position:fixed;bottom:0;left:0;right:0;background:var(--bg-sidebar);border-top:1px solid var(--border);padding:10px 20px;display:none;align-items:center;gap:12px;z-index:500;box-shadow:0 -4px 20px rgba(0,0,0,.3)}
.batch-bar.open{display:flex}
.batch-count{font-size:13px;color:var(--text-heading);font-weight:600;margin-right:auto}
.batch-btn{padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border-input);background:var(--bg-input);color:var(--text-dim);transition:all .15s}
.batch-btn:hover{background:var(--bg-hover);color:var(--text-heading);border-color:var(--accent)}
.batch-btn.cancel{color:var(--danger);border-color:var(--danger-border)}
.batch-btn.cancel:hover{background:var(--danger-hover-bg)}

/* ── License Panel ── */
.license-info{padding:8px 0;margin-bottom:8px;border-bottom:1px solid var(--border)}
.license-badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.license-badge.free{background:rgba(255,255,255,.08);color:var(--text-muted)}
.license-badge.trial{background:rgba(251,191,36,.15);color:#fbbf24}
.license-badge.personal{background:rgba(34,197,94,.15);color:#22c55e}
.license-badge.pro{background:rgba(168,85,247,.15);color:#a855f7}
.license-btn{width:100%;background:var(--accent);color:#000;border:none;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;margin-top:6px;transition:all .2s}
.license-btn:hover{filter:brightness(1.15)}
/* ── Feature Lock Styles ── */
.feature-locked{opacity:0.7}
.feature-locked-overlay{display:flex;align-items:center;gap:8px;padding:10px 14px;color:#636366;font-size:12px}
.lock-icon{font-size:14px}
.lock-text{opacity:0.7}
.lock-badge{font-size:9px;font-weight:700;letter-spacing:1px;padding:2px 6px;border-radius:4px;background:rgba(168,85,247,0.15);color:#a855f7;margin-left:6px}
.empty-section{padding:12px 16px;text-align:center;color:var(--text-muted);font-size:12px}
.empty-section .empty-icon{font-size:20px;display:block;margin-bottom:4px}
.empty-section .btn-create{display:inline-block;margin-top:6px;padding:4px 12px;border-radius:6px;border:1px solid var(--border-input);background:var(--bg-input);color:var(--text-dim);font-size:11px;cursor:pointer;transition:all .15s}
.empty-section .btn-create:hover{color:var(--accent);border-color:var(--accent)}
.nav-section-row{display:flex;align-items:center;justify-content:space-between;padding:18px 16px 6px}
.nav-section-row .section-label{font-size:10px;font-weight:700;color:var(--text-section);letter-spacing:1.2px}
.add-btn{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px;transition:all .15s}
.add-btn:hover{color:var(--accent);background:var(--accent-dim)}
@media(max-width:768px){
  #lb-detail{width:100%;height:50%;top:auto;bottom:0;left:0;right:0;transform:translateY(100%);border-left:none;border-top:1px solid var(--border)}
  #lb-detail.open{transform:translateY(0)}
}

/* ── Feature Panel Overlays ── */
.feature-overlay{position:fixed;inset:0;z-index:2100;display:none;flex-direction:column;background:var(--bg-body);overflow:hidden}
.feature-overlay.open{display:flex}
.feature-header{display:flex;align-items:center;gap:12px;padding:16px 24px;background:var(--bg-sidebar);border-bottom:1px solid var(--border);flex-shrink:0}
.feature-header h2{font-size:18px;font-weight:600;color:var(--text-heading);flex:1;margin:0}
.feature-header .fh-btn{background:var(--accent);color:black;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .2s}
.feature-header .fh-btn:hover{filter:brightness(1.15)}
.feature-header .fh-btn.secondary{background:rgba(255,255,255,.08);color:var(--text-dim)}
.feature-header .fh-btn.secondary:hover{background:rgba(255,255,255,.12)}
.feature-header .fh-close{background:none;border:none;color:var(--text-muted);font-size:22px;cursor:pointer;padding:4px 8px;border-radius:6px}
.feature-header .fh-close:hover{color:#fff;background:rgba(255,255,255,.08)}
.feature-body{flex:1;overflow-y:auto;padding:20px 24px}
.feature-progress{padding:16px 24px;border-top:1px solid var(--border);background:var(--bg-sidebar);flex-shrink:0}
.feature-progress .fp-bar{width:100%;height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;margin-top:6px}
.feature-progress .fp-fill{height:100%;background:var(--accent);border-radius:3px;transition:width .3s}
.feature-progress .fp-text{font-size:12px;color:var(--text-muted)}

/* ── People Panel ── */
.people-panel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.people-panel-card{text-align:center;cursor:pointer;padding:12px;border-radius:12px;border:1px solid transparent;transition:all .2s}
.people-panel-card:hover{background:var(--bg-card-hover);border-color:var(--border)}
.people-panel-card .pp-avatar{width:80px;height:80px;border-radius:50%;margin:0 auto 8px;overflow:hidden;background:var(--bg-card);border:2px solid var(--border)}
.people-panel-card .pp-avatar img{width:100%;height:100%;object-fit:cover}
.people-panel-card .pp-name{font-size:13px;color:var(--text-heading);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.people-panel-card .pp-count{font-size:11px;color:var(--text-muted);margin-top:2px}
.people-detail-view{display:none}
.people-detail-view.active{display:block}
.people-detail-header{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.people-detail-header .pdh-avatar{width:48px;height:48px;border-radius:50%;overflow:hidden;border:2px solid var(--border)}
.people-detail-header .pdh-avatar img{width:100%;height:100%;object-fit:cover}
.people-detail-header .pdh-name{font-size:16px;font-weight:600;color:var(--text-heading);cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid transparent}
.people-detail-header .pdh-name:hover{border-color:var(--border);background:var(--bg-input)}
.people-detail-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.people-detail-grid .pd-thumb{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;transition:transform .15s}
.people-detail-grid .pd-thumb:hover{transform:scale(1.03)}
.face-scan-status{text-align:center;padding:40px;color:var(--text-muted)}
.face-scan-status .fss-icon{font-size:48px;margin-bottom:12px}

/* ── Map View ── */
#map-container{width:100%;height:100%;overflow:hidden}
.map-locations-sidebar{width:260px;flex-shrink:0;background:var(--bg-sidebar);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
.mls-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px;flex-shrink:0}
.mls-title{font-size:13px;font-weight:700;color:var(--text-heading);letter-spacing:.5px}
.mls-total{font-size:11px;color:var(--text-muted)}
.mls-search{margin:0 12px 8px;padding:7px 12px;border-radius:8px;border:1px solid var(--border-input);background:var(--bg-input);color:var(--text-heading);font-size:12px;outline:none;flex-shrink:0}
.mls-search:focus{border-color:var(--accent)}
.mls-list{flex:1;overflow-y:auto;padding:0 8px 12px}
.mls-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;transition:all .15s;border:1px solid transparent}
.mls-item:hover{background:var(--bg-card-hover);border-color:var(--border)}
.mls-item.active{background:var(--accent-dim);border-color:var(--accent)}
.mls-item .mls-icon{font-size:18px;flex-shrink:0}
.mls-item .mls-info{flex:1;min-width:0}
.mls-item .mls-name{font-size:12px;font-weight:500;color:var(--text-heading);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mls-item .mls-meta{font-size:10px;color:var(--text-muted);margin-top:1px}
.mls-item .mls-count{font-size:11px;color:var(--text-muted);font-weight:600;background:rgba(255,255,255,.06);padding:2px 8px;border-radius:10px;flex-shrink:0}
.mls-empty{text-align:center;padding:30px 16px;color:var(--text-muted);font-size:12px}
.mls-thumb{width:36px;height:36px;border-radius:8px;background:var(--bg-card);background-size:cover;background-position:center;flex-shrink:0;border:1px solid var(--border)}
@media(max-width:768px){.map-locations-sidebar{width:200px}}
.map-photo-strip{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);padding:12px;z-index:1100;display:none;overflow-x:auto;white-space:nowrap;border-top:1px solid rgba(255,255,255,.1)}
.map-photo-strip.open{display:flex;gap:8px}
.map-photo-strip img{height:80px;border-radius:6px;cursor:pointer;opacity:.8;transition:all .2s;flex-shrink:0}
.map-photo-strip img:hover{opacity:1;transform:scale(1.05)}
.map-photo-strip .mps-close{position:absolute;top:8px;right:12px;background:rgba(255,255,255,.1);border:none;color:#fff;font-size:16px;cursor:pointer;padding:4px 8px;border-radius:4px}

/* ── Duplicate Finder ── */
.dup-group{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px}
.dup-group-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.dup-group-header span{font-size:13px;color:var(--text-dim);font-weight:500}
.dup-group-header .dg-actions{display:flex;gap:6px}
.dup-group-header .dg-btn{background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--text-dim);padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;transition:all .15s}
.dup-group-header .dg-btn:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.dup-group-header .dg-btn.danger:hover{background:var(--danger);border-color:var(--danger)}
.dup-thumbs{display:flex;gap:10px;flex-wrap:wrap}
.dup-thumb-card{position:relative;border-radius:8px;overflow:hidden;border:2px solid transparent;cursor:pointer;transition:all .2s;flex-shrink:0}
.dup-thumb-card:hover{border-color:var(--accent)}
.dup-thumb-card.selected{border-color:var(--danger)}
.dup-thumb-card img{width:140px;height:140px;object-fit:cover;display:block}
.dup-thumb-card .dtc-info{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.8);padding:4px 6px;font-size:10px;color:rgba(255,255,255,.8)}
.dup-thumb-card .dtc-check{position:absolute;top:6px;right:6px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.5);border:2px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;font-size:11px;color:transparent}
.dup-thumb-card.selected .dtc-check{background:var(--danger);border-color:var(--danger);color:#fff}
.dup-empty{text-align:center;padding:60px 20px;color:var(--text-muted)}
.dup-empty .de-icon{font-size:48px;margin-bottom:12px}

/* ── Cloud Import ── */
.import-tabs{display:flex;gap:4px;margin-bottom:20px}
.import-tab{padding:8px 16px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--text-dim);font-size:13px;cursor:pointer;transition:all .2s}
.import-tab:hover{background:rgba(255,255,255,.1)}
.import-tab.active{background:var(--accent);color:black;border-color:var(--accent)}
.import-section{display:none;max-width:600px}
.import-section.active{display:block}
.import-field{margin-bottom:16px}
.import-field label{display:block;font-size:12px;color:var(--text-dim);margin-bottom:6px;font-weight:500}
.import-field input{width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border-input);background:var(--bg-input);color:var(--text-heading);font-size:14px}
.import-field input:focus{outline:none;border-color:var(--accent)}
.import-field .if-hint{font-size:11px;color:var(--text-muted);margin-top:4px}
.import-result{margin-top:16px;padding:16px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid var(--border)}
.import-result h4{font-size:14px;color:var(--text-heading);margin-bottom:8px}
.import-result .ir-stat{font-size:13px;color:var(--text-dim);margin-bottom:4px}
</style>
</head>
<body>

<div id="app">
  <div id="sidebar-overlay" onclick="toggleSidebar()"></div>
  
  <aside id="sidebar">
    <div class="brand">
      <img src="/api/logo" alt="Pluto" class="brand-logo">
      <h1>Pluto Photos</h1>
    </div>
    <div id="sidebar-nav"><div id="nav-inner"></div></div>
    <div id="sidebar-footer">
      <div id="license-panel" class="license-info"></div>
      <div class="theme-toggle">
        <button class="theme-btn" data-theme-val="dark" onclick="setTheme('dark')">Dark</button>
        <button class="theme-btn" data-theme-val="cyber" onclick="setTheme('cyber')">Cyber</button>
        <button class="theme-btn" data-theme-val="light" onclick="setTheme('light')">Light</button>
      </div>
      <button id="logout-btn" onclick="location.href='/api/logout'">🔒 Logout</button>
    </div>
  </aside>

  <div id="main">
    <div id="header">
      <div class="header-top">
        <button id="menu-btn" onclick="toggleSidebar()">☰</button>
        <div class="header-left">
          <h2 id="view-title">All Photos</h2>
          <p class="item-count" id="item-count"></p>
        </div>
        <div class="header-controls">
          <input id="search-input" type="text" placeholder="Search…" oninput="handleSearch(this.value)">
          <select id="sort-select" onchange="handleSort(this.value)">
            <option value="date_taken-DESC">Newest</option>
            <option value="date_taken-ASC">Oldest</option>
            <option value="name-ASC">Name A-Z</option>
            <option value="name-DESC">Name Z-A</option>
          </select>
          <div class="slider-wrapper">
            <span class="slider-label">Size</span>
            <input type="range" min="120" max="400" step="10" value="160" class="thumb-slider" id="thumb-slider" oninput="setThumbSize(this.value)">
          </div>
        </div>
      </div>
      <hr class="header-hr">
      <div class="toolbar-row" id="feature-toolbar">
        <button class="tool-btn locked" onclick="featureClick('smartAlbums')" title="Smart Albums">
          <span>✨</span><span class="tool-label">Smart Albums</span><span class="pro-pip">PRO</span>
        </button>
        <button class="tool-btn locked" onclick="featureClick('faceDetection')" title="People">
          <span>👥</span><span class="tool-label">Faces</span><span class="pro-pip">PRO</span>
        </button>
        <button class="tool-btn locked" onclick="featureClick('mapView')" title="Map View">
          <span>📍</span><span class="tool-label">Map</span><span class="pro-pip">PRO</span>
        </button>
        <button class="tool-btn locked" onclick="featureClick('duplicateFinder')" title="Find Duplicates">
          <span>📋</span><span class="tool-label">Duplicates</span><span class="pro-pip">PRO</span>
        </button>
        <button class="tool-btn locked" onclick="featureClick('cloudImport')" title="Cloud Import">
          <span>☁</span><span class="tool-label">Cloud</span><span class="pro-pip">PRO</span>
        </button>
        <span class="toolbar-sep"></span>
        <button class="tool-btn" onclick="startSlideshow()" title="Slideshow">
          <span>▶</span><span class="tool-label">Slideshow</span>
        </button>
      </div>
    </div>
    <div id="content-area">
    <div id="gallery-col">
    <div id="gallery">
      <div class="grid" id="grid"></div>
      <button id="load-more" onclick="loadMore()" style="display:none">Load More</button>
      <div class="loading" id="loading" style="display:none"><div class="spinner"></div> Loading…</div>
      <div class="empty-state" id="empty" style="display:none">No images found</div>
    </div>
    </div>

    <!-- Right Gallery Sidebar -->
    <aside id="right-sidebar">
      <div class="rsb-section" id="rsb-content">
        <!-- Filled dynamically by renderRightSidebar() -->
      </div>
      <div class="rsb-actions" id="rsb-actions" style="display:none">
        <!-- Filled dynamically -->
      </div>
    </aside>

    <!-- Image Editor Modal -->
    <div id="editor-overlay" style="display:none">
      <div class="editor-panel">
        <div class="editor-header">
          <h2>Edit Photo</h2>
          <span class="editor-filename" id="editor-filename"></span>
          <div class="editor-tools">
            <button class="editor-hdr-btn" id="editor-undo" onclick="editorUndo()" title="Undo" disabled>↩</button>
            <button class="editor-hdr-btn" id="editor-redo" onclick="editorRedo()" title="Redo" disabled>↪</button>
          </div>
          <button class="editor-close" onclick="closeEditor()">✕</button>
        </div>
        <div class="editor-body">
          <div class="editor-canvas-area">
            <canvas id="editor-canvas"></canvas>
            <div id="editor-loading" style="display:none"><div class="spinner"></div><p id="editor-loading-text">Processing...</p></div>
          </div>
          <div class="editor-controls">
            <div class="editor-section">
              <h3>Quick Actions</h3>
              <div class="editor-quick-actions">
                <button class="editor-tool-btn" onclick="editorRotate(-90)" title="Rotate Left">↺</button>
                <button class="editor-tool-btn" onclick="editorRotate(90)" title="Rotate Right">↻</button>
                <button class="editor-tool-btn" id="editor-crop-btn" onclick="editorToggleCrop()" title="Crop">✂️</button>
                <button class="editor-tool-btn" onclick="editorAutoEnhance()" title="Auto Enhance">✨</button>
              </div>
            </div>
            <div class="editor-section">
              <h3>Background <span class="pro-tag">PRO</span></h3>
              <button class="editor-action-btn" id="editor-bg-btn" onclick="editorRemoveBg()">Remove Background</button>
              <p class="editor-pro-hint" id="editor-bg-hint" style="display:none">Upgrade to Pro to remove backgrounds</p>
            </div>
            <div class="editor-section">
              <h3>Adjustments</h3>
              <div class="editor-slider-group">
                <label>Brightness <span id="val-brightness">100</span>%</label>
                <input type="range" min="50" max="200" value="100" class="editor-slider" oninput="editorAdjust('brightness',this.value)">
              </div>
              <div class="editor-slider-group">
                <label>Contrast <span id="val-contrast">100</span>%</label>
                <input type="range" min="50" max="200" value="100" class="editor-slider" oninput="editorAdjust('contrast',this.value)">
              </div>
              <div class="editor-slider-group">
                <label>Saturation <span id="val-saturation">100</span>%</label>
                <input type="range" min="0" max="300" value="100" class="editor-slider" oninput="editorAdjust('saturation',this.value)">
              </div>
              <div class="editor-slider-group">
                <label>Sharpen <span id="val-sharpen">0</span></label>
                <input type="range" min="0" max="10" step="0.5" value="0" class="editor-slider" oninput="editorAdjust('sharpen',this.value)">
              </div>
            </div>
            <div class="editor-section">
              <h3>Quick Filters</h3>
              <div class="editor-filter-grid" id="editor-filters"></div>
            </div>
            <div class="editor-section">
              <button class="editor-action-btn" onclick="editorReset()">Reset All</button>
            </div>
            <div class="editor-section editor-save">
              <button class="editor-action-btn editor-primary" onclick="editorSave()">💾 Save as Copy</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>

  <div id="lightbox">
    <button id="lb-close" onclick="closeLightbox()">✕</button>
    <button id="lb-detail-toggle" onclick="toggleDetailPanel()" title="Details">ℹ</button>
    <a id="lb-download" title="Download">⬇<span>Save</span></a>
    <button id="lb-prev" onclick="lbNav(-1)">‹</button>
    <button id="lb-next" onclick="lbNav(1)">›</button>
    <div id="lb-meta"></div>
    <div id="lb-content"></div>
    <div id="lb-info"></div>
    <div id="lb-detail">
      <div class="detail-section">
        <div class="detail-label">RATING</div>
        <div class="rating-stars" id="detail-rating"></div>
      </div>
      <div class="detail-section">
        <div class="detail-label">COLOR LABEL</div>
        <div class="color-labels" id="detail-colors"></div>
      </div>
      <div class="detail-section">
        <div class="detail-label">TAGS</div>
        <div class="tag-list" id="detail-tags"></div>
        <div class="tag-input-row">
          <input class="tag-input" id="tag-input" placeholder="Add tag..." onkeydown="if(event.key==='Enter')addTagFromInput()">
          <button class="tag-add-btn" onclick="addTagFromInput()">+</button>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-label">ALBUMS</div>
        <div class="album-chips" id="detail-albums"></div>
        <button class="add-to-album-btn" onclick="showAddToAlbumModal()">+ Add to Album</button>
      </div>
    </div>
  </div>
</div>

<div id="slideshow">
  <button id="ss-close" onclick="stopSlideshow()">✕</button>
  <button id="ss-gear" onclick="openSlideshowSettings()">⚙</button>
  <button id="ss-pause" onclick="toggleSlideshowPause()">⏸</button>
  <button id="ss-prev" onclick="ssNav(-1)">‹</button>
  <button id="ss-next" onclick="ssNav(1)">›</button>
  <div id="ss-content">
    <div id="ss-layer-a" class="ss-layer"></div>
    <div id="ss-layer-b" class="ss-layer"></div>
  </div>
  <div id="ss-info"></div>
  <div id="ss-progress" style="width:0%"></div>
  <div id="ss-counter"></div>
</div>

<div id="ss-settings-overlay" onclick="if(event.target===this)closeSlideshowSettings()">
  <div id="ss-settings">
    <h3>Slideshow Settings <button onclick="closeSlideshowSettings()">✕</button></h3>
    <div class="ss-group">
      <div class="ss-group-label">Duration</div>
      <div class="ss-pills" id="ss-dur-pills"></div>
    </div>
    <div class="ss-group">
      <div class="ss-group-label">Transition</div>
      <div class="ss-pills" id="ss-trans-pills"></div>
    </div>
    <div class="ss-group">
      <div class="ss-group-label">Fit Mode</div>
      <div class="ss-pills" id="ss-fit-pills"></div>
    </div>
    <div class="ss-toggle-row">
      <span>Shuffle photos</span>
      <label class="ss-switch"><input type="checkbox" id="ss-shuffle"><span class="slider"></span></label>
    </div>
    <div class="ss-toggle-row">
      <span>Loop slideshow</span>
      <label class="ss-switch"><input type="checkbox" id="ss-loop" checked><span class="slider"></span></label>
    </div>
    <div class="ss-toggle-row">
      <span>Show photo info</span>
      <label class="ss-switch"><input type="checkbox" id="ss-show-info"><span class="slider"></span></label>
    </div>
    <button id="ss-start-btn" onclick="launchSlideshow()">▶ Start Slideshow</button>
  </div>
</div>

<!-- ── People / Faces Panel ── -->
<div class="feature-overlay" id="people-overlay">
  <div class="feature-header">
    <button class="fh-close" onclick="closePeoplePanel()">←</button>
    <h2 id="people-title">People</h2>
    <button class="fh-btn secondary" id="people-back-btn" onclick="peopleBackToGrid()" style="display:none">← All People</button>
    <button class="fh-btn" id="people-scan-btn" onclick="startFaceScan()">🔍 Scan for Faces</button>
    <button class="fh-btn secondary" id="people-rescan-btn" onclick="resetFaceScan()" title="Clear all face data and re-scan with improved accuracy">🔄 Rescan All</button>
    <button class="fh-close" onclick="closePeoplePanel()">✕</button>
  </div>
  <div class="feature-body" id="people-body">
    <div id="people-grid-view">
      <div class="people-panel-grid" id="people-panel-grid"></div>
      <div class="face-scan-status" id="face-scan-empty" style="display:none">
        <div class="fss-icon">👥</div>
        <p>No people detected yet.</p>
        <p style="margin-top:8px;font-size:13px">Click <strong>Scan for Faces</strong> to detect people in your library.</p>
      </div>
    </div>
    <div class="people-detail-view" id="people-detail-view">
      <div class="people-detail-header">
        <div class="pdh-avatar" id="pdh-avatar"></div>
        <span class="pdh-name" id="pdh-name" onclick="renamePerson()" title="Click to rename"></span>
        <span style="color:var(--text-muted);font-size:12px" id="pdh-count"></span>
      </div>
      <div class="people-detail-grid" id="people-detail-grid"></div>
    </div>
  </div>
  <div class="feature-progress" id="face-progress" style="display:none">
    <div class="fp-text" id="face-progress-text">Scanning...</div>
    <div class="fp-bar"><div class="fp-fill" id="face-progress-fill" style="width:0%"></div></div>
  </div>
</div>

<!-- ── Map View Panel ── -->
<div class="feature-overlay" id="map-overlay">
  <div class="feature-header">
    <button class="fh-close" onclick="closeMapView()">←</button>
    <h2>Map View</h2>
    <span id="map-count" style="font-size:12px;color:var(--text-muted)"></span>
    <button class="fh-btn" id="map-scan-btn" onclick="scanGpsLibrary()">🔍 Scan Library</button>
    <button class="fh-close" onclick="closeMapView()">✕</button>
  </div>
  <div class="feature-body" style="padding:0;position:relative;display:flex">
    <div class="map-locations-sidebar" id="map-locations-sidebar">
      <div class="mls-header">
        <span class="mls-title">📍 Locations</span>
        <span class="mls-total" id="mls-total"></span>
      </div>
      <input class="mls-search" id="mls-search" type="text" placeholder="Filter locations..." oninput="filterMapLocations(this.value)">
      <div class="mls-list" id="mls-list"></div>
    </div>
    <div style="flex:1;position:relative;min-width:0">
      <div id="map-container"></div>
      <div class="map-photo-strip" id="map-photo-strip">
        <button class="mps-close" onclick="closeMapStrip()">✕</button>
      </div>
    </div>
  </div>
  <div class="feature-progress" id="map-progress" style="display:none">
    <div class="fp-text" id="map-progress-text">Scanning for GPS data...</div>
    <div class="fp-bar"><div class="fp-fill" id="map-progress-fill" style="width:0%"></div></div>
  </div>
</div>

<!-- ── Duplicate Finder Panel ── -->
<div class="feature-overlay" id="dup-overlay">
  <div class="feature-header">
    <button class="fh-close" onclick="closeDupFinder()">←</button>
    <h2>Duplicate Finder</h2>
    <span id="dup-count" style="font-size:12px;color:var(--text-muted)"></span>
    <button class="fh-btn" id="dup-scan-btn" onclick="scanDuplicates()">🔍 Scan Library</button>
    <button class="fh-close" onclick="closeDupFinder()">✕</button>
  </div>
  <div class="feature-body" id="dup-body">
    <div class="dup-empty" id="dup-empty">
      <div class="de-icon">📋</div>
      <p>Click <strong>Scan Library</strong> to find duplicate photos.</p>
    </div>
    <div id="dup-groups"></div>
  </div>
  <div class="feature-progress" id="dup-progress" style="display:none">
    <div class="fp-text" id="dup-progress-text">Scanning for duplicates...</div>
    <div class="fp-bar"><div class="fp-fill" id="dup-progress-fill" style="width:0%"></div></div>
  </div>
</div>

<!-- ── Cloud Import Panel ── -->
<div class="feature-overlay" id="import-overlay">
  <div class="feature-header">
    <button class="fh-close" onclick="closeCloudImport()">←</button>
    <h2>Import Photos</h2>
    <button class="fh-close" onclick="closeCloudImport()">✕</button>
  </div>
  <div class="feature-body">
    <div class="import-tabs">
      <button class="import-tab active" onclick="switchImportTab('takeout',this)">📁 Google Takeout</button>
      <button class="import-tab" onclick="switchImportTab('folder',this)">📂 Import Folder</button>
      <button class="import-tab" onclick="switchImportTab('immich',this)">🖥️ Immich Server</button>
    </div>
    <div class="import-section active" id="import-takeout">
      <p style="color:var(--text-dim);font-size:13px;margin-bottom:16px;line-height:1.5">
        Import photos from a Google Takeout export. Mount the Takeout folder into your Docker container
        (e.g. <code style="background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px">/imports/Takeout</code>) 
        and enter the path below.
      </p>
      <div class="import-field">
        <label>Takeout Path (inside container)</label>
        <input type="text" id="import-takeout-path" placeholder="/imports/Takeout/Google Photos" value="/imports">
        <div class="if-hint">Must be under /photos, /imports, or /data</div>
      </div>
      <button class="fh-btn" onclick="runImport('takeout')">📥 Import from Takeout</button>
      <div class="import-result" id="import-takeout-result" style="display:none"></div>
    </div>
    <div class="import-section" id="import-folder">
      <p style="color:var(--text-dim);font-size:13px;margin-bottom:16px;line-height:1.5">
        Import from any folder mounted inside the container. All supported image and video formats 
        will be scanned recursively and added to your library.
      </p>
      <div class="import-field">
        <label>Folder Path (inside container)</label>
        <input type="text" id="import-folder-path" placeholder="/photos/MyFolder">
        <div class="if-hint">Must be under /photos, /imports, or /data</div>
      </div>
      <button class="fh-btn" onclick="runImport('folder')">📥 Import Folder</button>
      <div class="import-result" id="import-folder-result" style="display:none"></div>
    </div>
    <div class="import-section" id="import-immich">
      <p style="color:var(--text-dim);font-size:13px;margin-bottom:16px;line-height:1.5">
        Import photos directly from an Immich server. Files will be downloaded to 
        <code style="background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px">/imports/immich</code> 
        inside the container.
      </p>
      <div class="import-field">
        <label>Immich Server URL</label>
        <input type="text" id="import-immich-url" placeholder="http://192.168.1.100:2283">
        <div class="if-hint">The full URL of your Immich server</div>
      </div>
      <div class="import-field">
        <label>API Key</label>
        <input type="password" id="import-immich-key" placeholder="Your Immich API key">
        <div class="if-hint">Generate in Immich → User Settings → API Keys</div>
      </div>
      <button class="fh-btn" onclick="runImmichImport()">📥 Import from Immich</button>
      <div class="import-result" id="import-immich-result" style="display:none"></div>
    </div>
  </div>
  <div class="feature-progress" id="import-progress" style="display:none">
    <div class="fp-text" id="import-progress-text">Importing...</div>
    <div class="fp-bar"><div class="fp-fill" id="import-progress-fill" style="width:0%"></div></div>
  </div>
</div>

<div class="modal-overlay" id="modal-overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal-box" id="modal-box"></div>
</div>
<div class="ctx-menu" id="ctx-menu"></div>
<div class="toast-container" id="toast-container"></div>
<div class="batch-bar" id="batch-bar">
  <span class="batch-count" id="batch-count">0 selected</span>
  <button class="batch-btn" onclick="batchRate()">⭐ Rate</button>
  <button class="batch-btn" onclick="batchColor()">🏷 Label</button>
  <button class="batch-btn" onclick="batchTag()">🔖 Tag</button>
  <button class="batch-btn" onclick="batchAddToAlbum()">📁 Album</button>
  <button class="batch-btn cancel" onclick="exitBatchMode()">✕ Cancel</button>
</div>

<script>
// ── State ──
let state = {
  view: 'unsorted',  // 'unsorted' | 'album' | 'folder'
  albumId: null,
  folderId: null,
  title: 'All Photos',
  search: '',
  sort: 'date_taken-DESC',
  images: [],
  total: 0,
  offset: 0,
  limit: 80,
  loading: false,
  projects: [],
  folders: [],
  collapsedProjects: {},
  lbIndex: -1,
  smartAlbums: [],
  people: [],
  collapsedSections: {},
  // Slideshow state
  ssRunning: false,
  ssPaused: false,
  ssIndex: 0,
  ssInterval: 4000,
  ssTimer: null,
  ssDuration: 4,
  ssTransition: 'fade',
  ssShuffle: false,
  ssLoop: true,
  ssShowInfo: false,
  ssFit: 'contain',
  ssActiveLayer: 'a',
  ssOrder: [],
  ssPausedBySettings: false,
  batchMode: false,
  selectedImages: new Set(),
  detailOpen: false,
  currentDetail: null,
  licenseInfo: null,
  rsbDetail: null,
  rsbSelectedId: null,
  thumbSize: 160,
};

const $ = id => document.getElementById(id);

// ── API helpers ──
const api = path => fetch(path).then(r => r.json());
function postApi(path, body) { return fetch(path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(function(r) { return r.json(); }); }
function toast(msg, type) {
  // Show license/limit errors as a centered popup the user must dismiss
  if (type === 'error' && /limit|license|requires a|upgrade|tier/i.test(msg)) {
    showModal('<div style="text-align:center;padding:8px 0"><div style="font-size:40px;margin-bottom:12px">🔒</div><h3 style="margin:0 0 12px;color:var(--text-heading)">Limit Reached</h3><p style="color:var(--text-muted);font-size:14px;line-height:1.5;margin:0 0 20px">' + esc(msg) + '</p><div class="modal-actions" style="justify-content:center;gap:10px"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button><button class="modal-btn modal-btn-primary" onclick="closeModal();showLicenseModal()">Upgrade</button></div></div>');
    return;
  }
  var c = $('toast-container'); var t = document.createElement('div'); t.className = 'toast' + (type ? ' ' + type : ''); t.textContent = msg; c.appendChild(t); setTimeout(function() { t.style.animation = 'toastOut .3s ease forwards'; setTimeout(function() { t.remove(); }, 300); }, 3000);
}

// ── Sidebar ──
async function loadSidebar() {
  const [projects, folders, smartAlbums, people, licenseInfo] = await Promise.all([
    api('/api/projects'), api('/api/folders'),
    api('/api/smart-albums').catch(() => []),
    api('/api/people').catch(() => []),
    api('/api/license-info').catch(() => null)
  ]);
  state.projects = projects;
  state.folders = folders;
  state.smartAlbums = smartAlbums;
  state.people = people;
  if (licenseInfo) { state.licenseInfo = licenseInfo; renderLicensePanel(); }
  renderSidebar();
}

function renderSidebar() {
  const inner = $('nav-inner');
  let html = '';
  var li = state.licenseInfo || {};
  var tier = li.tier || 'free';

  // All Photos
  const allActive = state.view === 'unsorted' ? ' active' : '';
  html += '<div class="nav-item' + allActive + '" data-nav="unsorted" onclick="selectUnsorted()"><span class="icon">📸</span><span class="label">All Photos</span></div>';

  // Folders
  var maxFolders = (state.licenseInfo && state.licenseInfo.limits && state.licenseInfo.limits.maxFolders) || 1;
  html += '<div class="nav-section" style="display:flex;align-items:center;justify-content:space-between">FOLDERS<span class="add-btn" onclick="event.stopPropagation();showImportFolderModal()" title="Import Folder">+</span></div>';
  if (state.folders.length) {
    state.folders.forEach(function(f, fIdx) {
      var folderLocked = (tier === 'free') && fIdx >= maxFolders;
      const active = !folderLocked && state.view === 'folder' && state.folderId == f.id ? ' active' : '';
      const name = f.displayName || f.path.split(/[\\\\\\/]/).pop();
      if (folderLocked) {
        html += '<div class="nav-item folder-locked" style="opacity:0.45;cursor:default" onclick="showLicenseModal()">'
          + '<span class="icon">📁</span><span class="label">' + esc(name) + '</span>'
          + '<span class="lock-badge" style="margin-left:auto;font-size:9px">🔒</span></div>';
      } else {
        html += '<div class="nav-item' + active + '" data-nav="folder-' + f.id + '" onclick="selectFolder(' + f.id + ',\\'' + esc(name) + '\\')">'
          + '<span class="icon">📁</span><span class="label">' + esc(name) + '</span>'
          + '<span class="count">' + (f.inAlbumsCount||0) + '/' + (f.totalCount||0) + '</span></div>';
      }
    });
  }

  // Smart Albums (always shown)
  var isPro = state.licenseInfo && state.licenseInfo.features && state.licenseInfo.features.smartAlbums;
  var saLocked = !isPro;
  {
    const saCollapsed = state.collapsedSections['smart-albums'];
    html += '<div class="project-hdr' + (saLocked ? ' feature-locked' : '') + '" onclick="toggleSection(\\'smart-albums\\')">' +
      '<span class="chevron' + (saCollapsed ? ' collapsed' : '') + '">▼</span>' +
      '<span class="pname">SMART ALBUMS</span>' +
      (saLocked ? '<span class="lock-badge">PRO</span>' : '<span class="add-btn" onclick="event.stopPropagation();showSmartAlbumModal()" title="New Smart Album">+</span>') +
      '</div>';
    html += '<div' + (saCollapsed ? ' style="display:none"' : '') + ' data-section="smart-albums">';
    if (saLocked) {
      html += '<div class="feature-locked-overlay"><span class="lock-icon">🔒</span><span class="lock-text">Upgrade to Pro</span></div>';
    } else if (!state.smartAlbums.length) {
      html += '<div class="empty-section"><span class="empty-icon">🔍</span>No smart albums yet<br><button class="btn-create" onclick="showSmartAlbumModal()">Create Smart Album</button></div>';
    } else {
      state.smartAlbums.forEach(sa => {
        const active = state.view === 'smart-album' && state.smartAlbumId == sa.id ? ' active' : '';
        const iconEmoji = ({search:'🔍',star:'⭐',image:'🖼️',film:'🎬',camera:'📷',heart:'❤️','map-pin':'📍',calendar:'📅',globe:'🌍',user:'👤'})[sa.icon] || sa.icon || '🔍';
        html += '<div class="nav-item' + active + '" data-nav="smart-' + sa.id + '" onclick="selectSmartAlbum(' + sa.id + ',\\'' + esc(sa.name) + '\\')">' +
          '<span class="icon">' + iconEmoji + '</span>' +
          '<span class="label">' + esc(sa.name) + '</span></div>';
      });
    }
    html += '</div>';
  }

  // People (always shown)
  var hasFaces = state.licenseInfo && state.licenseInfo.features && state.licenseInfo.features.faceDetection;
  var pplLocked = !hasFaces;
  {
    const pplCollapsed = state.collapsedSections['people'];
    html += '<div class="project-hdr' + (pplLocked ? ' feature-locked' : '') + '" onclick="toggleSection(\\'people\\')">' +
      '<span class="chevron' + (pplCollapsed ? ' collapsed' : '') + '">▼</span>' +
      '<span class="pname">PERSONS</span>' +
      (pplLocked ? '<span class="lock-badge">PRO</span>' : '') +
      '</div>';
    html += '<div' + (pplCollapsed ? ' style="display:none"' : '') + ' data-section="people">';
    if (pplLocked) {
      html += '<div class="feature-locked-overlay"><span class="lock-icon">🔒</span><span class="lock-text">Upgrade to Pro</span></div>';
    } else if (!state.people.length) {
      html += '<div class="empty-section"><span class="empty-icon">👤</span>No people discovered yet</div>';
    } else {
      html += '<div class="people-grid">';
      state.people.forEach(p => {
        const active = state.view === 'person' && state.personId == p.id ? ' active' : '';
        const initial = (p.name && p.name !== 'Unknown') ? p.name.charAt(0).toUpperCase() : '👤';
        const avatarContent = p.firstImageId ? '<img src="/api/thumbnail/' + p.firstImageId + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentElement.innerHTML=\\'' + initial + '\\'">' : initial;
        html += '<div class="person-card' + active + '" data-person-id="' + p.id + '" onclick="selectPerson(' + p.id + ',\\'' + esc(p.name || 'Unknown') + '\\')">' +
          '<div class="person-avatar">' + avatarContent + '</div>' +
          '<span class="person-name">' + esc(p.name || 'Unknown') + '</span>' +
          '<span class="person-count">' + (p.face_count || 0) + '</span></div>';
      });
      html += '</div>';
    }
    html += '</div>';
  }

  // Projects & Albums
  var maxAlbums = (li.limits && li.limits.maxAlbums) || 1;
  var albumIdx = 0;
  if (state.projects.length) {
    html += '<div class="nav-section-row"><span class="section-label">PROJECTS</span><span class="add-btn" onclick="event.stopPropagation();showCreateProjectModal()" title="New Project">+</span></div>';
    state.projects.forEach(p => {
      const collapsed = state.collapsedProjects[p.id];
      html += '<div class="project-hdr" data-project="' + p.id + '" onclick="toggleProject(' + p.id + ')">'
        + '<span class="chevron' + (collapsed ? ' collapsed' : '') + '">▼</span>'
        + '<span class="pname">' + esc(p.name) + '</span>'
        + '<span class="add-btn" onclick="event.stopPropagation();showCreateAlbumModal(' + p.id + ')" title="New Album">+</span></div>';
      html += '<div class="project-albums" data-project-albums="' + p.id + '"' + (collapsed ? ' style="display:none"' : '') + '>';
      if (p.albums) {
        p.albums.forEach(a => {
          var albumLocked = (tier === 'free') && albumIdx >= maxAlbums;
          albumIdx++;
          if (albumLocked) {
            const coverHtml = a.coverUrl
              ? '<img src="' + a.coverUrl + '" loading="lazy" style="filter:blur(4px) brightness(0.5)"/>'
              : '<span class="placeholder">🖼️</span>';
            html += '<div class="album-item" style="opacity:0.45;cursor:default" onclick="showLicenseModal()">'
              + '<div class="album-thumb">' + coverHtml + '</div>'
              + '<span class="album-label">' + esc(a.name) + '</span>'
              + '<span class="lock-badge" style="margin-left:auto;font-size:9px">🔒</span></div>';
          } else {
            const active = state.view === 'album' && state.albumId == a.id ? ' active' : '';
            const coverHtml = a.coverUrl
              ? '<img src="' + a.coverUrl + '" loading="lazy"/>'
              : '<span class="placeholder">🖼️</span>';
            html += '<div class="album-item' + active + '" data-nav="album-' + a.id + '" data-album-id="' + a.id + '" data-album-name="' + esc(a.name) + '" onclick="selectAlbum(' + a.id + ',\\'' + esc(a.name) + '\\')" ondragover="handleAlbumDragOver(event,this)" ondragleave="handleAlbumDragLeave(event,this)" ondrop="handleAlbumDrop(event,this)">' 
              + '<div class="album-thumb">' + coverHtml + '</div>'
              + '<span class="album-label">' + esc(a.name) + '</span>'
              + '<span class="album-count">' + (a.imageCount||0) + '</span></div>';
          }
        });
      }
      html += '</div>';
    });
  }

  inner.innerHTML = html;
}

// Lightweight active-state update — no DOM rebuild, no image reloads
function updateSidebarActive() {
  const nav = $('sidebar-nav');
  if (!nav) return;
  let activeKey = 'unsorted';
  if (state.view === 'folder' && state.folderId) activeKey = 'folder-' + state.folderId;
  if (state.view === 'album' && state.albumId) activeKey = 'album-' + state.albumId;
  if (state.view === 'smart-album' && state.smartAlbumId) activeKey = 'smart-' + state.smartAlbumId;
  // Toggle nav-item active states
  nav.querySelectorAll('[data-nav]').forEach(el => {
    if (el.dataset.nav === activeKey) el.classList.add('active');
    else el.classList.remove('active');
  });
  // Toggle person-card active states
  nav.querySelectorAll('.person-card').forEach(el => {
    if (state.view === 'person' && state.personId && el.dataset.personId == state.personId) el.classList.add('active');
    else el.classList.remove('active');
  });
}

function esc(s) {
  if (s === null || s === undefined) return '';
  s = String(s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function toggleProject(id) {
  state.collapsedProjects[id] = !state.collapsedProjects[id];
  const group = document.querySelector('[data-project-albums="' + id + '"]');
  const chevron = document.querySelector('[data-project="' + id + '"] .chevron');
  if (group) group.style.display = state.collapsedProjects[id] ? 'none' : '';
  if (chevron) chevron.classList.toggle('collapsed', !!state.collapsedProjects[id]);
}

function toggleSection(name) {
  state.collapsedSections[name] = !state.collapsedSections[name];
  const group = document.querySelector('[data-section="' + name + '"]');
  if (group) group.style.display = state.collapsedSections[name] ? 'none' : '';
  // Find the chevron in the preceding project-hdr
  if (group && group.previousElementSibling) {
    const chevron = group.previousElementSibling.querySelector('.chevron');
    if (chevron) chevron.classList.toggle('collapsed', !!state.collapsedSections[name]);
  }
}

function toggleSidebar() {
  $('sidebar').classList.toggle('open');
  $('sidebar-overlay').classList.toggle('open');
}

function closeSidebarOnMobile() {
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('open');
}

// ── Thumbnail Size Slider ──
function setThumbSize(val) {
  var grid = $('grid');
  if (grid) grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(' + val + 'px,1fr))';
}

// ── Feature Toolbar ──
function featureClick(feature) {
  var li = state.licenseInfo;
  var unlocked = li && li.features && li.features[feature];
  if (!unlocked) {
    showLicenseModal();
    return;
  }
  if (feature === 'smartAlbums') showSmartAlbumModal();
  else if (feature === 'faceDetection') showPeoplePanel();
  else if (feature === 'mapView') showMapView();
  else if (feature === 'duplicateFinder') showDupFinder();
  else if (feature === 'cloudImport') showCloudImport();
}

function updateToolbar() {
  var li = state.licenseInfo;
  var btns = document.querySelectorAll('#feature-toolbar .tool-btn');
  btns.forEach(function(btn) {
    var feat = btn.getAttribute('onclick');
    if (!feat) return;
    var m = feat.match(/featureClick\\('(\\w+)'\\)/);
    if (!m) return;
    var unlocked = li && li.features && li.features[m[1]];
    btn.classList.toggle('locked', !unlocked);
    var pip = btn.querySelector('.pro-pip');
    if (pip) pip.style.display = unlocked ? 'none' : '';
  });
}

function updateItemCount() {
  var el = $('item-count');
  if (!el) return;
  var count = state.total || 0;
  var sel = state.batchMode ? state.selectedImages.size : 0;
  var html = count.toLocaleString() + ' ' + (count === 1 ? 'item' : 'items');
  if (sel > 0) html += ' <span class="selection-tag">' + sel + ' selected</span>';
  el.innerHTML = html;
}

// ══════════════════════════════════════════════
// ═══════════ PEOPLE / FACES PANEL ═══════════
// ══════════════════════════════════════════════
let _faceApiLoaded = false;
let _faceScanRunning = false;
let _currentPersonId = null;

function showPeoplePanel() {
  $('people-overlay').classList.add('open');
  $('people-grid-view').style.display = '';
  $('people-detail-view').className = 'people-detail-view';
  $('people-back-btn').style.display = 'none';
  $('people-title').textContent = 'People';
  _currentPersonId = null;
  loadPeopleGrid();
}

function closePeoplePanel() {
  $('people-overlay').classList.remove('open');
  _faceScanRunning = false;
}

async function loadPeopleGrid() {
  try {
    const people = await api('/api/people');
    const grid = $('people-panel-grid');
    if (!people || people.length === 0) {
      grid.innerHTML = '';
      $('face-scan-empty').style.display = '';
      return;
    }
    $('face-scan-empty').style.display = 'none';
    grid.innerHTML = people.map(p => {
      const avatarImg = p.firstImageId ? '<img src="/api/thumbnail/' + p.firstImageId + '" onerror="this.parentElement.innerHTML=\\'👤\\'">' : '👤';
      return '<div class="people-panel-card" onclick="showPersonDetail(' + p.id + ',\\'' + esc(p.name || 'Unknown').replace(/'/g, "\\\\'") + '\\')">' +
        '<div class="pp-avatar">' + avatarImg + '</div>' +
        '<div class="pp-name">' + esc(p.name || 'Unknown') + '</div>' +
        '<div class="pp-count">' + (p.face_count || 0) + ' photo' + (p.face_count === 1 ? '' : 's') + '</div></div>';
    }).join('');
  } catch (err) {
    toast('Failed to load people: ' + err.message, 'error');
  }
}

async function showPersonDetail(personId, personName) {
  _currentPersonId = personId;
  $('people-grid-view').style.display = 'none';
  $('people-detail-view').className = 'people-detail-view active';
  $('people-back-btn').style.display = '';
  $('people-title').textContent = personName || 'Unknown';
  $('pdh-name').textContent = personName || 'Unknown';
  $('pdh-count').textContent = '';
  
  try {
    const data = await api('/api/person-images?id=' + personId);
    $('pdh-count').textContent = data.total + ' photo' + (data.total === 1 ? '' : 's');
    // Use first image as avatar
    const avatarImg = data.images.length > 0 ? '<img src="' + data.images[0].thumbUrl + '">' : '👤';
    $('pdh-avatar').innerHTML = avatarImg;
    const grid = $('people-detail-grid');
    grid.innerHTML = '';
    const pName = personName || 'Unknown';
    const pId = personId;
    data.images.forEach(function(img) {
      const thumb = document.createElement('img');
      thumb.className = 'pd-thumb';
      thumb.src = img.thumbUrl;
      thumb.title = img.name || '';
      var _clickTimer = null;
      thumb.onclick = function() {
        if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
        _clickTimer = setTimeout(function() {
          _clickTimer = null;
          closePeoplePanel();
          state._pendingSelectId = img.id;
          selectPerson(pId, pName);
        }, 250);
      };
      thumb.ondblclick = function(e) {
        e.preventDefault();
        if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
        closePeoplePanel();
        state._pendingLightboxId = img.id;
        selectPerson(pId, pName);
      };
      grid.appendChild(thumb);
    });
  } catch (err) {
    toast('Failed to load person images: ' + err.message, 'error');
  }
}

function peopleBackToGrid() {
  $('people-grid-view').style.display = '';
  $('people-detail-view').className = 'people-detail-view';
  $('people-back-btn').style.display = 'none';
  $('people-title').textContent = 'People';
  _currentPersonId = null;
  loadPeopleGrid();
}

async function renamePerson() {
  if (!_currentPersonId) return;
  const name = prompt('Enter new name:');
  if (!name) return;
  try {
    await postApi('/api/rename-person', { personId: _currentPersonId, name: name.trim() });
    $('pdh-name').textContent = name.trim();
    $('people-title').textContent = name.trim();
    toast('Renamed to ' + name.trim(), 'success');
  } catch (err) {
    toast('Failed to rename: ' + err.message, 'error');
  }
}

async function loadFaceApiModels() {
  if (_faceApiLoaded) return;
  return new Promise((resolve, reject) => {
    if (window.faceapi) { _faceApiLoaded = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = '/face-models/face-api.js';
    s.onload = async () => {
      try {
        const MODEL_URL = '/face-models/model';
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        _faceApiLoaded = true;
        resolve();
      } catch (e) { reject(e); }
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function resetFaceScan() {
  if (_faceScanRunning) { toast('Stop the current scan first.', 'warning'); return; }
  if (!confirm('This will clear all detected faces and people data, then re-scan everything with improved accuracy. Continue?')) return;
  try {
    await postApi('/api/reset-face-data', {});
    toast('Face data cleared. Starting fresh scan...', 'info');
    loadPeopleGrid();
    loadSidebar();
    startFaceScan();
  } catch (err) {
    toast('Failed to reset: ' + err.message, 'error');
  }
}

async function startFaceScan() {
  if (_faceScanRunning) { _faceScanRunning = false; return; }
  _faceScanRunning = true;
  $('face-progress').style.display = '';
  $('people-scan-btn').textContent = '⏹ Stop Scan';
  
  try {
    $('face-progress-text').textContent = 'Loading face detection models...';
    $('face-progress-fill').style.width = '0%';
    await loadFaceApiModels();
    
    const unscanned = await postApi('/api/unscanned-images', {});
    if (!unscanned || unscanned.length === 0) {
      toast('All images already scanned!', 'info');
      _faceScanRunning = false;
      $('face-progress').style.display = 'none';
      $('people-scan-btn').textContent = '🔍 Scan for Faces';
      return;
    }
    
    const total = unscanned.length;
    let done = 0;
    
    for (const img of unscanned) {
      if (!_faceScanRunning) break;
      done++;
      $('face-progress-text').textContent = 'Scanning ' + done + ' / ' + total + ' — ' + img.name;
      $('face-progress-fill').style.width = Math.round((done / total) * 100) + '%';
      
      try {
        // Load full-res image and resize via canvas for better face detection
        const imgEl = new Image();
        imgEl.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          imgEl.onload = resolve;
          imgEl.onerror = reject;
          imgEl.src = '/api/media/' + img.id;
        });
        // Resize to max 1600px for optimal detection speed + accuracy
        const MAX_DIM = 1600;
        let cw = imgEl.naturalWidth, ch = imgEl.naturalHeight;
        const scale = (cw > MAX_DIM || ch > MAX_DIM) ? MAX_DIM / Math.max(cw, ch) : 1;
        cw = Math.round(imgEl.naturalWidth * scale);
        ch = Math.round(imgEl.naturalHeight * scale);

        const normalCanvas = (() => {
          const c = document.createElement('canvas');
          c.width = cw; c.height = ch;
          c.getContext('2d').drawImage(imgEl, 0, 0, cw, ch);
          return c;
        })();

        const ssdOpts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
        const allDets = await faceapi.detectAllFaces(normalCanvas, ssdOpts).withFaceLandmarks().withFaceDescriptors();

        // Landmark validation — reject backs of heads / non-faces
        function isValidFaceLandmarks(det) {
          try {
            var lm = det.landmarks, box = det.detection.box;
            function avg(pts) { var sx=0, sy=0; for (var i=0;i<pts.length;i++){sx+=pts[i].x;sy+=pts[i].y;} return {x:sx/pts.length,y:sy/pts.length}; }
            var leC = avg(lm.getLeftEye()), reC = avg(lm.getRightEye()), nC = avg(lm.getNose()), mC = avg(lm.getMouth());
            var eyeY = (leC.y + reC.y) / 2;
            if (eyeY >= mC.y) return false;
            if (nC.y <= eyeY || nC.y >= mC.y) return false;
            if (Math.abs(leC.x - reC.x) < box.width * 0.15) return false;
            if ((mC.y - eyeY) < box.height * 0.15) return false;
            return true;
          } catch(e) { return false; }
        }

        console.log('[FaceDetect] ' + (img.filename || img.id) + ' (' + cw + 'x' + ch + ') raw:' + allDets.length);

        const faces = allDets
          .filter(d => d.detection.box.width >= 20 && d.detection.box.height >= 20)
          .filter(isValidFaceLandmarks)
          .map(d => {
          const rb = d.detection.relativeBox;
          return {
            x: rb.x,
            y: rb.y,
            width: rb.width,
            height: rb.height,
            descriptor: Array.from(d.descriptor)
          };
        });
        
        await postApi('/api/save-detected-faces', { imageId: img.id, faces });
      } catch (scanErr) {
        // Skip errors for individual images
      }
    }
    
    toast('Face scan complete! Scanned ' + done + ' images. Merging similar people...', 'success');
    $('face-progress-text').textContent = 'Merging similar people...';
    try {
      const mergeResult = await postApi('/api/auto-merge-people', {});
      if (mergeResult.merged > 0) {
        toast('Merged ' + mergeResult.merged + ' duplicate people. ' + mergeResult.remainingPeople + ' people remaining.', 'success');
      }
    } catch (mergeErr) {
      // Non-critical, continue
    }
    loadPeopleGrid();
    loadSidebar();
  } catch (err) {
    toast('Face scan failed: ' + err.message, 'error');
  }
  
  _faceScanRunning = false;
  $('face-progress').style.display = 'none';
  $('people-scan-btn').textContent = '🔍 Scan for Faces';
}

// ══════════════════════════════════════════════
// ═══════════════ MAP VIEW ═══════════════════
// ══════════════════════════════════════════════
let _leafletLoaded = false;
let _map = null;
let _mapMarkers = null;
let _mapLocations = []; // [{name, lat, lng, count, photos}]
let _activeLocationKey = null;
let _mapStripPhotos = [];
let _savedGalleryState = null;

function showMapView() {
  $('map-overlay').classList.add('open');
  loadMapResources().then(() => initMap());
}

function closeMapView() {
  $('map-overlay').classList.remove('open');
  closeMapStrip();
  _activeLocationKey = null;
}

function loadMapResources() {
  if (_leafletLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const mcLink = document.createElement('link');
    mcLink.rel = 'stylesheet';
    mcLink.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
    document.head.appendChild(mcLink);

    const mcLinkDef = document.createElement('link');
    mcLinkDef.rel = 'stylesheet';
    mcLinkDef.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
    document.head.appendChild(mcLinkDef);

    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => {
      const mc = document.createElement('script');
      mc.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
      mc.onload = () => { _leafletLoaded = true; resolve(); };
      mc.onerror = reject;
      document.head.appendChild(mc);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function initMap() {
  const container = $('map-container');
  if (!_map) {
    _map = L.map(container).setView([30, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(_map);
    _mapMarkers = L.markerClusterGroup({ maxClusterRadius: 60 });
    _map.addLayer(_mapMarkers);
  }
  
  setTimeout(() => _map.invalidateSize(), 100);
  
  try {
    const images = await api('/api/images-with-gps');
    $('map-count').textContent = images.length + ' geotagged photo' + (images.length === 1 ? '' : 's');
    _mapMarkers.clearLayers();
    
    // Group by fine coords for markers
    const photosAtLocation = {};
    images.forEach(img => {
      const key = img.gpsLat.toFixed(4) + ',' + img.gpsLng.toFixed(4);
      if (!photosAtLocation[key]) photosAtLocation[key] = [];
      photosAtLocation[key].push(img);
    });
    
    Object.values(photosAtLocation).forEach(photos => {
      const p = photos[0];
      const marker = L.marker([p.gpsLat, p.gpsLng]);
      marker.on('click', () => showMapStrip(photos));
      marker.bindTooltip(photos.length + ' photo' + (photos.length === 1 ? '' : 's'));
      _mapMarkers.addLayer(marker);
    });
    
    if (images.length > 0) {
      const bounds = _mapMarkers.getBounds();
      if (bounds.isValid()) _map.fitBounds(bounds, { padding: [50, 50] });
    }

    // Build coarser location groups for sidebar (group by ~1km grid)
    const locGroups = {};
    images.forEach(img => {
      const key = img.gpsLat.toFixed(2) + ',' + img.gpsLng.toFixed(2);
      if (!locGroups[key]) locGroups[key] = { lat: 0, lng: 0, photos: [], key: key };
      locGroups[key].photos.push(img);
      locGroups[key].lat += img.gpsLat;
      locGroups[key].lng += img.gpsLng;
    });

    _mapLocations = Object.values(locGroups).map(g => {
      g.lat /= g.photos.length;
      g.lng /= g.photos.length;
      g.count = g.photos.length;
      g.name = g.lat.toFixed(4) + '°, ' + g.lng.toFixed(4) + '°';
      // Date range
      const dates = g.photos.filter(p => p.dateTaken).map(p => new Date(p.dateTaken)).sort((a, b) => a - b);
      if (dates.length > 0) {
        const first = dates[0];
        const last = dates[dates.length - 1];
        g.dateRange = first.toLocaleDateString() + (dates.length > 1 && first.toLocaleDateString() !== last.toLocaleDateString() ? ' – ' + last.toLocaleDateString() : '');
      } else {
        g.dateRange = '';
      }
      return g;
    }).sort((a, b) => b.count - a.count);

    // Try to get reverse-geocoded names from the server (non-blocking)
    try {
      const locs = _mapLocations.map(l => ({ lat: l.lat, lng: l.lng }));
      const names = await postApi('/api/reverse-geocode', { locations: locs });
      if (names && names.length === _mapLocations.length) {
        _mapLocations.forEach((loc, i) => { if (names[i]) loc.name = names[i]; });
      }
    } catch {}

    $('mls-total').textContent = _mapLocations.length + ' location' + (_mapLocations.length === 1 ? '' : 's');
    renderMapLocations(_mapLocations);
  } catch (err) {
    toast('Failed to load map data: ' + err.message, 'error');
  }
}

function renderMapLocations(locations) {
  const list = $('mls-list');
  if (locations.length === 0) {
    list.innerHTML = '<div class="mls-empty">No locations found.<br>Click <strong>Scan Library</strong> to detect GPS data.</div>';
    return;
  }
  // "Show All" item at top
  let html = '<div class="mls-item' + (!_activeLocationKey ? ' active' : '') + '" onclick="mapShowAll()">' +
    '<span class="mls-icon">🌍</span><div class="mls-info"><div class="mls-name">All Locations</div>' +
    '<div class="mls-meta">' + _mapLocations.reduce((s, l) => s + l.count, 0) + ' photos</div></div></div>';
  locations.forEach(loc => {
    const active = _activeLocationKey === loc.key ? ' active' : '';
    const thumb = loc.photos[0] ? ' style="background-image:url(/api/thumbnail/' + loc.photos[0].id + ')"' : '';
    html += '<div class="mls-item' + active + '" onclick="mapSelectLocation(\\'' + loc.key + '\\')">' +
      '<div class="mls-thumb"' + thumb + '></div>' +
      '<div class="mls-info"><div class="mls-name">' + esc(loc.name) + '</div>' +
      '<div class="mls-meta">' + (loc.dateRange || '') + '</div></div>' +
      '<span class="mls-count">' + loc.count + '</span></div>';
  });
  list.innerHTML = html;
}

function filterMapLocations(query) {
  const q = query.toLowerCase().trim();
  if (!q) { renderMapLocations(_mapLocations); return; }
  renderMapLocations(_mapLocations.filter(l => l.name.toLowerCase().includes(q)));
}

function mapShowAll() {
  _activeLocationKey = null;
  closeMapStrip();
  if (_map && _mapMarkers.getLayers().length > 0) {
    const bounds = _mapMarkers.getBounds();
    if (bounds.isValid()) _map.fitBounds(bounds, { padding: [50, 50] });
  }
  renderMapLocations(_mapLocations);
}

function mapSelectLocation(key) {
  _activeLocationKey = key;
  const loc = _mapLocations.find(l => l.key === key);
  if (!loc) return;
  renderMapLocations(_mapLocations);
  if (_map) _map.setView([loc.lat, loc.lng], 14);
  showMapStrip(loc.photos);
}

function showMapStrip(photos) {
  const strip = $('map-photo-strip');
  const closeBtn = strip.querySelector('.mps-close');
  strip.innerHTML = '';
  strip.appendChild(closeBtn);
  _mapStripPhotos = photos.map(function(p) {
    return { id: p.id, name: p.name, thumbUrl: p.thumbUrl, mediaUrl: '/api/media/' + p.id, isVideo: false, dateTaken: p.dateTaken };
  });
  photos.forEach(function(p, i) {
    const img = document.createElement('img');
    img.src = p.thumbUrl;
    img.title = p.name + (p.dateTaken ? ' — ' + new Date(p.dateTaken).toLocaleDateString() : '');
    img.onclick = function() { openMapLightbox(i); };
    strip.appendChild(img);
  });
  strip.classList.add('open');
}

function openMapLightbox(idx) {
  _savedGalleryState = { images: state.images.slice(), offset: state.offset, total: state.total };
  state.images = _mapStripPhotos;
  state.total = _mapStripPhotos.length;
  state.offset = _mapStripPhotos.length;
  $('lightbox').classList.add('above-overlay');
  openLightbox(idx);
}

function closeMapStrip() {
  $('map-photo-strip').classList.remove('open');
}

let _gpsScanRunning = false;
async function scanGpsLibrary() {
  if (_gpsScanRunning) { _gpsScanRunning = false; return; }
  _gpsScanRunning = true;
  const btn = $('map-scan-btn');
  btn.textContent = '⏹ Stop Scan';
  $('map-progress').style.display = '';
  $('map-progress-fill').style.width = '0%';
  $('map-progress-text').textContent = 'Preparing scan...';

  try {
    const unscanned = await api('/api/gps-unscanned-count');
    const total = unscanned.count || 0;
    if (total === 0) {
      toast('All images already scanned for GPS data!', 'info');
      _gpsScanRunning = false;
      $('map-progress').style.display = 'none';
      btn.textContent = '🔍 Scan Library';
      return;
    }
    let done = 0;
    let found = 0;
    const BATCH = 50;
    while (_gpsScanRunning) {
      const result = await postApi('/api/scan-gps-batch', { batchSize: BATCH });
      done += result.scanned || 0;
      found += result.found || 0;
      const pct = Math.min(100, Math.round((done / total) * 100));
      $('map-progress-fill').style.width = pct + '%';
      $('map-progress-text').textContent = 'Scanning ' + done + ' / ' + total + ' — found ' + found + ' with GPS';
      if (result.remaining === 0) break;
    }
    toast('GPS scan complete — found ' + found + ' geotagged photos', 'success');
    await initMap();
  } catch (err) {
    toast('GPS scan failed: ' + err.message, 'error');
  }

  _gpsScanRunning = false;
  $('map-progress').style.display = 'none';
  btn.textContent = '🔍 Scan Library';
}

// ══════════════════════════════════════════════
// ═══════════ DUPLICATE FINDER ═══════════════
// ══════════════════════════════════════════════
let _dupGroups = [];

function showDupFinder() {
  $('dup-overlay').classList.add('open');
  $('dup-groups').innerHTML = '';
  $('dup-empty').style.display = '';
  $('dup-count').textContent = '';
  _dupGroups = [];
}

function closeDupFinder() {
  $('dup-overlay').classList.remove('open');
}

async function scanDuplicates() {
  $('dup-scan-btn').disabled = true;
  $('dup-scan-btn').textContent = '⏳ Scanning...';
  $('dup-empty').style.display = 'none';
  $('dup-groups').innerHTML = '';
  $('dup-progress').style.display = '';
  $('dup-progress-text').textContent = 'Computing image hashes and finding duplicates...';
  $('dup-progress-fill').style.width = '0%';
  // Animate progress bar while waiting
  let _dupProg = 0;
  const _dupTimer = setInterval(() => { _dupProg = Math.min(_dupProg + 2, 90); $('dup-progress-fill').style.width = _dupProg + '%'; }, 500);
  
  try {
    const data = await postApi('/api/find-duplicates', {});
    clearInterval(_dupTimer);
    $('dup-progress-fill').style.width = '100%';
    _dupGroups = data.groups || [];
    renderDupGroups();
    $('dup-count').textContent = _dupGroups.length + ' group' + (_dupGroups.length === 1 ? '' : 's') + ' found';
    if (_dupGroups.length === 0) {
      $('dup-empty').style.display = '';
      $('dup-empty').innerHTML = '<div class="de-icon">✅</div><p>No duplicates found! Your library is clean.</p>';
    }
    toast('Found ' + _dupGroups.length + ' duplicate groups', 'success');
  } catch (err) {
    clearInterval(_dupTimer);
    toast('Duplicate scan failed: ' + err.message, 'error');
    $('dup-empty').style.display = '';
  }
  
  $('dup-scan-btn').disabled = false;
  $('dup-scan-btn').textContent = '🔍 Scan Library';
  setTimeout(() => { $('dup-progress').style.display = 'none'; }, 800);
}

function renderDupGroups() {
  const container = $('dup-groups');
  container.innerHTML = _dupGroups.map((group, gi) => {
    const thumbs = group.map((img, ii) => {
      const sizeStr = img.file_size ? formatFileSize(img.file_size) : '';
      return '<div class="dup-thumb-card" onclick="toggleDupSelect(this)" data-gidx="' + gi + '" data-id="' + img.id + '">' +
        '<img src="' + img.thumb + '" title="' + esc(img.name) + '">' +
        '<div class="dtc-info">' + esc(img.name) + (sizeStr ? ' · ' + sizeStr : '') + '</div>' +
        '<div class="dtc-check">✓</div></div>';
    }).join('');
    return '<div class="dup-group" id="dup-group-' + gi + '">' +
      '<div class="dup-group-header"><span>Group ' + (gi + 1) + ' — ' + group.length + ' images</span>' +
      '<div class="dg-actions">' +
      '<button class="dg-btn" onclick="dupCompare(' + gi + ')">👁 Compare</button>' +
      '<button class="dg-btn danger" onclick="dupDeleteSelected(' + gi + ')">🗑 Delete Selected</button>' +
      '<button class="dg-btn" onclick="dupDismiss(' + gi + ')">✕ Not Duplicates</button>' +
      '</div></div>' +
      '<div class="dup-thumbs">' + thumbs + '</div></div>';
  }).join('');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function toggleDupSelect(el) {
  el.classList.toggle('selected');
}

async function dupDeleteSelected(groupIdx) {
  const cards = document.querySelectorAll('#dup-group-' + groupIdx + ' .dup-thumb-card.selected');
  if (cards.length === 0) { toast('Select images to delete first', 'info'); return; }
  if (!confirm('Delete ' + cards.length + ' selected duplicate(s)? This cannot be undone.')) return;
  
  for (const card of cards) {
    try {
      await postApi('/api/delete-duplicate', { imageId: parseInt(card.dataset.id) });
      card.remove();
    } catch {}
  }
  
  // Remove group if only 1 or 0 items remain
  const remaining = document.querySelectorAll('#dup-group-' + groupIdx + ' .dup-thumb-card');
  if (remaining.length <= 1) {
    const groupEl = $('dup-group-' + groupIdx);
    if (groupEl) groupEl.remove();
  }
  toast('Deleted ' + cards.length + ' duplicate(s)', 'success');
  loadImages();
}

async function dupDismiss(groupIdx) {
  const group = _dupGroups[groupIdx];
  if (!group) return;
  const imageIds = group.map(g => g.id);
  try {
    await postApi('/api/dismiss-duplicate-group', { imageIds });
    const groupEl = $('dup-group-' + groupIdx);
    if (groupEl) groupEl.remove();
    toast('Dismissed group', 'success');
  } catch (err) {
    toast('Failed to dismiss: ' + err.message, 'error');
  }
}

function dupCompare(groupIdx) {
  const group = _dupGroups[groupIdx];
  if (!group || group.length < 2) return;
  // Open a comparison in a modal
  const html = '<div style="text-align:center"><h3 style="margin-bottom:12px;color:var(--text-heading)">Compare Duplicates</h3>' +
    '<div style="display:flex;gap:12px;overflow-x:auto;padding:8px;justify-content:center">' +
    group.map(img => 
      '<div style="flex-shrink:0;text-align:center"><img src="' + img.thumb + '" style="width:200px;height:200px;object-fit:cover;border-radius:8px">' +
      '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">' + esc(img.name) + '</div>' +
      (img.file_size ? '<div style="font-size:10px;color:var(--text-muted)">' + formatFileSize(img.file_size) + '</div>' : '') +
      '</div>'
    ).join('') +
    '</div><div class="modal-actions" style="justify-content:center;margin-top:16px"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Close</button></div></div>';
  showModal(html);
}

// ══════════════════════════════════════════════
// ═══════════ CLOUD IMPORT ═══════════════════
// ══════════════════════════════════════════════

function showCloudImport() {
  $('import-overlay').classList.add('open');
  $('import-takeout-result').style.display = 'none';
  $('import-folder-result').style.display = 'none';
  var ir = $('import-immich-result'); if (ir) ir.style.display = 'none';
  $('import-progress').style.display = 'none';
}

function closeCloudImport() {
  $('import-overlay').classList.remove('open');
}

function switchImportTab(tab, btn) {
  document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.import-section').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  $('import-' + tab).classList.add('active');
}

async function runImport(type) {
  const pathInput = type === 'takeout' ? $('import-takeout-path') : $('import-folder-path');
  const resultEl = type === 'takeout' ? $('import-takeout-result') : $('import-folder-result');
  const importPath = pathInput.value.trim();
  
  if (!importPath) { toast('Please enter a path', 'info'); return; }
  
  $('import-progress').style.display = '';
  $('import-progress-text').textContent = 'Importing from ' + importPath + '...';
  $('import-progress-fill').style.width = '30%';
  resultEl.style.display = 'none';
  
  try {
    const data = await postApi('/api/import-from-path', { importPath });
    $('import-progress-fill').style.width = '100%';
    
    if (data.error) {
      toast('Import failed: ' + data.error, 'error');
      resultEl.innerHTML = '<h4>Import Failed</h4><div class="ir-stat" style="color:var(--danger)">' + esc(data.error) + '</div>';
    } else {
      toast('Imported ' + data.imported + ' new files!', 'success');
      resultEl.innerHTML = '<h4>✅ Import Complete</h4>' +
        '<div class="ir-stat">📁 Total files found: <strong>' + data.total + '</strong></div>' +
        '<div class="ir-stat">📥 Newly imported: <strong>' + data.imported + '</strong></div>' +
        '<div class="ir-stat">📍 Metadata matched: <strong>' + data.matched + '</strong></div>';
      loadImages();
      loadSidebar();
    }
    resultEl.style.display = '';
  } catch (err) {
    toast('Import failed: ' + err.message, 'error');
  }
  
  $('import-progress').style.display = 'none';
}

async function runImmichImport() {
  var serverUrl = $('import-immich-url').value.trim().replace(/[/]+$/, '');
  var apiKey = $('import-immich-key').value.trim();
  var resultEl = $('import-immich-result');
  if (!serverUrl || !apiKey) { toast('Please enter both the server URL and API key', 'info'); return; }
  $('import-progress').style.display = '';
  $('import-progress-text').textContent = 'Connecting to Immich server...';
  $('import-progress-fill').style.width = '15%';
  resultEl.style.display = 'none';
  try {
    var data = await postApi('/api/import-from-immich', { serverUrl: serverUrl, apiKey: apiKey });
    $('import-progress-fill').style.width = '100%';
    if (data.error) {
      toast('Immich import failed: ' + data.error, 'error');
      resultEl.innerHTML = '<h4>Import Failed</h4><div class="ir-stat" style="color:var(--danger)">' + esc(data.error) + '</div>';
    } else {
      toast('Imported ' + data.downloaded + ' photos from Immich!', 'success');
      resultEl.innerHTML = '<h4>✅ Immich Import Complete</h4>' +
        '<div class="ir-stat">📸 Total assets on server: <strong>' + data.total + '</strong></div>' +
        '<div class="ir-stat">📥 Downloaded: <strong>' + data.downloaded + '</strong></div>';
      loadImages();
      loadSidebar();
    }
    resultEl.style.display = '';
  } catch (err) {
    toast('Immich import failed: ' + err.message, 'error');
  }
  $('import-progress').style.display = 'none';
}

// ── Right Gallery Sidebar ──
function renderRightSidebar() {
  var content = $('rsb-content');
  var actions = $('rsb-actions');
  if (!content || !actions) return;
  var li = state.licenseInfo || {};
  var tier = li.tier || 'free';
  var sel = state.batchMode ? state.selectedImages.size : 0;
  var detail = state.rsbDetail;

  if (sel === 0 && !detail) {
    // Empty state
    var total = state.total || 0;
    var badgeCls = tier === 'free' ? 'rsb-badge-free' : (li.freeTrial ? 'rsb-badge-trial' : 'rsb-badge-pro');
    var tierLabel = li.freeTrial ? 'Pro Trial' : (tier.charAt(0).toUpperCase() + tier.slice(1));
    var html = '<div class="rsb-empty">';
    html += '<div class="rsb-empty-icon">🖼️</div>';
    html += '<h2 class="rsb-empty-title">No Selection</h2>';
    html += '<p class="rsb-empty-hint">Click a photo to see its details</p>';
    if (total > 0) {
      html += '<div class="rsb-stats"><span class="rsb-stat-val">' + total.toLocaleString() + '</span><span class="rsb-stat-label">' + (total === 1 ? 'item' : 'items') + ' in view</span></div>';
    }
    html += '<div class="rsb-tips">';
    html += '<p class="rsb-tip">💡 Hold <kbd>Ctrl</kbd> + click to select multiple</p>';
    html += '<p class="rsb-tip">💡 Hold <kbd>Shift</kbd> + click for range select</p>';
    html += '<p class="rsb-tip">💡 Double-click to open in viewer</p>';
    html += '</div>';

    // Trial CTA
    if (tier === 'free' && !li.trialUsed && !li.freeTrial) {
      html += '<div class="rsb-trial"><div class="rsb-trial-glow"></div><div class="rsb-trial-content">';
      html += '<div class="rsb-trial-icon">🚀</div>';
      html += '<h3 class="rsb-trial-title">Try Pro Free for 30 Days</h3>';
      html += '<p class="rsb-trial-sub">Unlock all features — no credit card required.</p>';
      html += '<div class="rsb-trial-feats">';
      ['Smart Albums','Face Detection','Map View','Duplicate Finder','Photo Editor','Batch Ops'].forEach(function(f) { html += '<span class="rsb-trial-feat">✓ ' + f + '</span>'; });
      html += '</div>';
      html += '<div class="rsb-trial-form" id="rsb-trial-form">';
      html += '<input type="email" class="rsb-trial-input" id="rsb-trial-email" placeholder="Enter your email">';
      html += '<button class="rsb-trial-btn" onclick="startTrialFromSidebar()">Start Free Trial</button>';
      html += '</div>';
      html += '<p class="rsb-trial-fine">One free trial per device.</p>';
      html += '</div></div>';
    }

    // License badge
    html += '<div class="rsb-license"><span class="rsb-badge ' + badgeCls + '">License: ' + tierLabel + '</span>';
    if (li.trialDaysLeft > 0) html += '<span style="font-size:11px;color:var(--text-muted)">' + li.trialDaysLeft + ' days left</span>';
    html += '</div>';
    html += '</div>';
    content.innerHTML = html;
    actions.style.display = 'none';
    return;
  }

  if (sel > 1) {
    // Multi-select
    content.innerHTML = '<div class="rsb-multi"><div class="rsb-multi-icon">🖼️</div><h1 class="rsb-multi-title">' + sel + ' selected</h1></div>';
    var aHtml = '';
    var isLocked = tier === 'free';
    var selectedVideoIds = Array.from(state.selectedImages).filter(function(id) {
      var item = state.images.find(function(img) { return img.id === id; });
      return isVideoLibraryItem(item);
    });
    if (selectedVideoIds.length) {
      aHtml += '<button class="rsb-btn rsb-btn-edit' + (isLocked ? ' rsb-btn-locked' : '') + '" onclick="' + (isLocked ? 'showLicenseModal()' : 'openVideoStudio(' + selectedVideoIds[0] + ')') + '">🎬 Video Studio (' + selectedVideoIds.length + ')' + (isLocked ? '<span class="lock-label">🔒</span>' : '') + '</button>';
    }
    aHtml += '<button class="rsb-btn rsb-btn-batch' + (isLocked ? ' rsb-btn-locked' : '') + '" onclick="' + (isLocked ? 'showLicenseModal()' : 'batchRate()') + '">⚡ Batch Operations (' + sel + ')' + (isLocked ? '<span class="lock-label">🔒</span>' : '') + '</button>';
    aHtml += '<button class="rsb-btn rsb-btn-danger" onclick="exitBatchMode()">✕ Cancel Selection</button>';
    actions.innerHTML = aHtml;
    actions.style.display = 'flex';
    return;
  }

  // Single selection with detail
  if (detail) {
    var html = '<div class="rsb-meta-label">FILE DETAILS</div>';
    html += '<h1 class="rsb-file-name">' + esc(detail.name || '') + '</h1>';
    html += '<div class="rsb-meta-list">';
    var rows = [];
    if (detail.type) rows.push(['Type', detail.type]);
    if (detail.size) rows.push(['Size', detail.size]);
    if (detail.dimensions) rows.push(['Dimensions', detail.dimensions]);
    if (detail.dateTaken) { try { rows.push(['Date', new Date(detail.dateTaken).toLocaleString()]); } catch(e) { rows.push(['Date', String(detail.dateTaken)]); } }
    if (detail.camera) rows.push(['Camera', detail.camera]);
    if (detail.fStop) rows.push(['f-Stop', detail.fStop]);
    if (detail.iso) rows.push(['ISO', detail.iso]);
    if (detail.exposure) rows.push(['Exposure', detail.exposure]);
    rows.forEach(function(r) { html += '<div class="rsb-meta-row"><span class="rsb-meta-key">' + r[0] + '</span><span class="rsb-meta-val">' + esc(r[1]) + '</span></div>'; });
    html += '</div>';

    // Rating
    html += '<div class="rsb-detail-section"><div class="rsb-detail-label">RATING</div><div class="rsb-rating-stars" id="rsb-rating">';
    for (var i = 1; i <= 5; i++) {
      html += '<span class="star' + (i <= (detail.rating || 0) ? ' filled' : '') + '" onclick="rsbSetRating(' + detail.id + ',' + i + ')" onmouseenter="rsbHoverStars(' + i + ')" onmouseleave="rsbUnhoverStars()">' + (i <= (detail.rating || 0) ? '★' : '☆') + '</span>';
    }
    html += '</div></div>';

    // Color labels
    html += '<div class="rsb-detail-section"><div class="rsb-detail-label">COLOR LABEL</div><div class="rsb-color-dots">';
    [{n:'',l:'None',h:'transparent'},{n:'red',l:'Red',h:'#ef4444'},{n:'orange',l:'Orange',h:'#f97316'},{n:'yellow',l:'Yellow',h:'#eab308'},{n:'green',l:'Green',h:'#22c55e'},{n:'blue',l:'Blue',h:'#3b82f6'},{n:'purple',l:'Purple',h:'#a855f7'}].forEach(function(c) {
      html += '<div class="rsb-color-dot' + (detail.colorLabel === c.n ? ' active' : '') + '" style="background:' + (c.h === 'transparent' ? 'var(--bg-input)' : c.h) + '" title="' + c.l + '" onclick="rsbSetColor(' + detail.id + ',\\'' + c.n + '\\')"></div>';
    });
    html += '</div></div>';

    // Tags
    html += '<div class="rsb-detail-section"><div class="rsb-detail-label">TAGS</div><div class="rsb-tag-list">';
    (detail.tags || []).forEach(function(t) { html += '<span class="rsb-tag-chip">' + esc(t) + '<span class="remove-tag" onclick="rsbRemoveTag(' + detail.id + ',\\'' + encodeURIComponent(t) + '\\')">✕</span></span>'; });
    html += '</div><div class="rsb-tag-row"><input class="rsb-tag-input" id="rsb-tag-input" placeholder="Add tag..." onkeydown="if(event.key===\\'Enter\\')rsbAddTag(' + detail.id + ')"><button class="rsb-tag-add" onclick="rsbAddTag(' + detail.id + ')">+</button></div></div>';

    // Albums
    html += '<div class="rsb-detail-section"><div class="rsb-detail-label">ALBUMS</div><div class="rsb-album-chips">';
    (detail.albums || []).forEach(function(a) { html += '<span class="rsb-album-chip">' + esc(a.name) + '<span class="remove-album" onclick="rsbRemoveAlbum(' + detail.id + ',' + a.id + ')">✕</span></span>'; });
    html += '</div><button class="rsb-btn" onclick="showAddToAlbumModal()" style="padding:6px 10px;font-size:11px">+ Add to Album</button></div>';

    content.innerHTML = html;

    // Actions
    var isEditable = /\.(jpe?g|png|webp|gif|ico)$/i.test(detail.name || '');
    var isVideo = isVideoDetail(detail);
    var aHtml = '';
    // Remove from Album (only when viewing an album)
    if (state.view === 'album' && state.albumId) {
      aHtml += '<button class="rsb-btn rsb-btn-outline" onclick="rsbRemoveFromAlbum(' + detail.id + ',' + state.albumId + ')">🗂️ Remove from Album</button>';
    }
    if (isEditable) {
      var editLocked = tier === 'free';
      aHtml += '<button class="rsb-btn rsb-btn-edit' + (editLocked ? ' rsb-btn-locked' : '') + '" onclick="' + (editLocked ? 'showLicenseModal()' : 'openEditor(' + detail.id + ')') + '">✏️ Edit Photo' + (editLocked ? '<span class="lock-label">🔒</span>' : '') + '</button>';
    }
    if (isVideo) {
      var studioLocked = tier === 'free';
      aHtml += '<button class="rsb-btn rsb-btn-edit' + (studioLocked ? ' rsb-btn-locked' : '') + '" onclick="' + (studioLocked ? 'showLicenseModal()' : 'openVideoStudio(' + detail.id + ')') + '">🎬 Open Video Studio' + (studioLocked ? '<span class="lock-label">🔒</span>' : '') + '</button>';
    }
    aHtml += '<button class="rsb-btn rsb-btn-export" onclick="window.open(\\'/api/download/' + detail.id + '\\')">📤 Export File</button>';
    aHtml += '<button class="rsb-btn rsb-btn-danger" onclick="rsbDeleteFromDisk(' + detail.id + ',\\'' + esc(detail.name || '') + '\\')">🗑️ Delete from Disk</button>';
    actions.innerHTML = aHtml;
    actions.style.display = 'flex';
    return;
  }

  // Fallback: if single selection but no detail loaded yet
  content.innerHTML = '<div class="rsb-empty"><div class="rsb-empty-icon">⏳</div><p class="rsb-empty-hint">Loading details...</p></div>';
  actions.style.display = 'none';
}

// Right sidebar detail interaction functions
function rsbSetRating(imageId, rating) {
  if (state.rsbDetail && state.rsbDetail.rating === rating) rating = 0;
  postApi('/api/set-rating', { imageId: imageId, rating: rating }).then(function(result) {
    if (result.success) { state.rsbDetail.rating = rating; renderRightSidebar(); toast('Rating updated'); }
    else toast(result.error || 'Failed', 'error');
  });
}
function rsbHoverStars(n) { var el = $('rsb-rating'); if (!el) return; el.querySelectorAll('.star').forEach(function(s, i) { s.classList.toggle('hover', i < n); s.textContent = i < n ? '★' : '☆'; }); }
function rsbUnhoverStars() { if (!state.rsbDetail) return; var r = state.rsbDetail.rating || 0; var el = $('rsb-rating'); if (!el) return; el.querySelectorAll('.star').forEach(function(s, i) { s.classList.remove('hover'); s.classList.toggle('filled', i < r); s.textContent = i < r ? '★' : '☆'; }); }
function rsbSetColor(imageId, colorLabel) {
  if (state.rsbDetail && state.rsbDetail.colorLabel === colorLabel) colorLabel = '';
  postApi('/api/set-color-label', { imageId: imageId, colorLabel: colorLabel }).then(function(result) {
    if (result.success) { state.rsbDetail.colorLabel = colorLabel; renderRightSidebar(); toast(colorLabel ? 'Label: ' + colorLabel : 'Label removed'); }
    else toast(result.error || 'Failed', 'error');
  });
}
function rsbAddTag(imageId) {
  var input = $('rsb-tag-input'); var tag = input ? input.value.trim() : '';
  if (!tag || !state.rsbDetail) return;
  postApi('/api/add-tag', { imageId: imageId, tag: tag }).then(function(result) {
    if (result.success) { if ((state.rsbDetail.tags || []).indexOf(tag) === -1) state.rsbDetail.tags.push(tag); renderRightSidebar(); toast('Tag added'); }
    else toast(result.error || 'Failed', 'error');
  });
}
function rsbRemoveTag(imageId, encodedTag) {
  var tag = decodeURIComponent(encodedTag);
  postApi('/api/remove-tag', { imageId: imageId, tag: tag }).then(function(result) {
    if (result.success) { state.rsbDetail.tags = (state.rsbDetail.tags || []).filter(function(t) { return t !== tag; }); renderRightSidebar(); toast('Tag removed'); }
    else toast(result.error || 'Failed', 'error');
  });
}
function rsbRemoveAlbum(imageId, albumId) {
  postApi('/api/remove-from-album', { albumId: albumId, imageIds: [imageId] }).then(function(result) {
    if (result.success) { state.rsbDetail.albums = (state.rsbDetail.albums || []).filter(function(a) { return a.id !== albumId; }); renderRightSidebar(); toast('Removed from album'); loadSidebar(); updateCardAlbumBadge(imageId, (state.rsbDetail.albums || []).length > 0); }
    else toast(result.error || 'Failed', 'error');
  });
}
function startTrialFromSidebar() {
  var email = $('rsb-trial-email') ? $('rsb-trial-email').value.trim() : '';
  if (!email) return;
  postApi('/api/start-trial', { email: email }).then(function(result) {
    if (result.success) { toast('Free trial started!', 'success'); loadLicenseInfo(); }
    else toast(result.error || 'Failed', 'error');
  });
}
function loadRsbDetail(imageId) {
  api('/api/image-details/' + imageId).then(function(detail) { state.rsbDetail = detail; renderRightSidebar(); }).catch(function() {});
}

// Live-update a card's in-album badge without full reload
function updateCardAlbumBadge(imageId, inAlbum) {
  // Update state.images
  var img = state.images.find(function(i) { return i.id === imageId; });
  if (img) img.inAlbum = inAlbum;
  // Update the DOM card
  var idx = state.images.indexOf(img);
  if (idx < 0) return;
  var card = $('grid').querySelector('.card[data-idx="' + idx + '"]');
  if (!card) return;
  if (inAlbum) {
    card.classList.add('in-album');
    if (!card.querySelector('.album-badge')) {
      var badge = document.createElement('div');
      badge.className = 'album-badge';
      badge.textContent = '\u2713 In Album';
      card.appendChild(badge);
    }
  } else {
    card.classList.remove('in-album');
    var existing = card.querySelector('.album-badge');
    if (existing) existing.remove();
  }
}
function rsbRemoveFromAlbum(imageId, albumId) {
  postApi('/api/remove-from-album', { albumId: albumId, imageIds: [imageId] }).then(function(result) {
    if (result.success) {
      toast('Removed from album', 'success');
      state.rsbDetail = null; state.rsbSelectedId = null;
      resetAndLoad(); loadSidebar();
    } else toast(result.error || 'Failed', 'error');
  });
}
function rsbDeleteFromDisk(imageId, name) {
  showModal('<h3>Delete from Disk <button onclick="closeModal()">\u2715</button></h3><p style="margin:12px 0;color:var(--text-muted)">Permanently delete <strong>' + esc(name) + '</strong>?<br><span style="color:var(--danger);font-size:12px">This action cannot be undone.</span></p><div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button><button class="modal-btn" style="background:var(--danger);color:#fff" onclick="confirmDeleteFromDisk(' + imageId + ')">Delete</button></div>');
}
function confirmDeleteFromDisk(imageId) {
  closeModal();
  postApi('/api/delete-images', { imageIds: [imageId] }).then(function(result) {
    if (result.success) {
      toast('Deleted ' + result.deleted + ' file(s)', 'success');
      state.rsbDetail = null; state.rsbSelectedId = null;
      resetAndLoad(); loadSidebar();
    } else toast(result.error || 'Failed', 'error');
  });
}

// ── Navigation ──
function selectUnsorted() {
  state.view = 'unsorted'; state.albumId = null; state.folderId = null;
  state.title = 'All Photos';
  resetAndLoad();
  closeSidebarOnMobile();
}

function selectFolder(id, name) {
  state.view = 'folder'; state.folderId = id; state.albumId = null;
  state.title = name;
  resetAndLoad();
  closeSidebarOnMobile();
}

function selectAlbum(id, name) {
  state.view = 'album'; state.albumId = id; state.folderId = null;
  state.title = name;
  resetAndLoad();
  closeSidebarOnMobile();
}

function selectSmartAlbum(id, name) {
  state.view = 'smart-album'; state.smartAlbumId = id; state.albumId = null; state.folderId = null; state.personId = null;
  state.title = '🔍 ' + name;
  resetAndLoad();
  closeSidebarOnMobile();
}

function selectPerson(id, name) {
  state.view = 'person'; state.personId = id; state.albumId = null; state.folderId = null; state.smartAlbumId = null;
  state.title = '👤 ' + name;
  resetAndLoad();
  closeSidebarOnMobile();
}

function resetAndLoad() {
  state.images = []; state.offset = 0; state.total = 0;
  state.rsbDetail = null; state.rsbSelectedId = null;
  $('grid').innerHTML = '';
  $('view-title').textContent = state.title;
  updateSidebarActive();
  updateItemCount();
  renderRightSidebar();
  loadImages();
}

// ── Search / Sort ──
let searchTimer;
function handleSearch(val) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = val; resetAndLoad(); }, 300);
}
function handleSort(val) {
  state.sort = val; resetAndLoad();
}

// ── Load images ──
async function loadImages() {
  if (state.loading) return;
  state.loading = true;
  $('loading').style.display = 'flex';
  $('empty').style.display = 'none';
  $('load-more').style.display = 'none';

  let url;
  if (state.view === 'smart-album' && state.smartAlbumId) {
    url = '/api/smart-album-images?id=' + state.smartAlbumId + '&limit=' + state.limit + '&offset=' + state.offset + '&sort=' + state.sort;
    if (state.search) url += '&search=' + encodeURIComponent(state.search);
  } else if (state.view === 'person' && state.personId) {
    url = '/api/person-images?id=' + state.personId + '&limit=' + state.limit + '&offset=' + state.offset + '&sort=' + state.sort;
  } else {
    url = '/api/images?limit=' + state.limit + '&offset=' + state.offset + '&sort=' + state.sort;
    if (state.search) url += '&search=' + encodeURIComponent(state.search);
    if (state.view === 'album' && state.albumId) url += '&albumId=' + state.albumId;
    if (state.view === 'folder' && state.folderId) url += '&folderId=' + state.folderId;
  }

  try {
    const data = await api(url);
    state.total = data.total;
    state.images = state.images.concat(data.images);
    state.offset += data.images.length;
    renderImages(data.images);
  } catch (e) {
    console.error('Failed to load images:', e);
  }

  state.loading = false;
  $('loading').style.display = 'none';
  if (state.images.length === 0) $('empty').style.display = 'flex';
  if (state.offset < state.total) $('load-more').style.display = 'block';
  else $('load-more').style.display = 'none';
  updateItemCount();
  renderRightSidebar();

  // Handle pending actions from faces/person detail
  if (state._pendingSelectId) {
    var pendingId = state._pendingSelectId;
    state._pendingSelectId = null;
    var pendingIdx = state.images.findIndex(function(im) { return im.id === pendingId; });
    if (pendingIdx >= 0) {
      document.querySelectorAll('.card.selected').forEach(function(c) { c.classList.remove('selected'); });
      var pendingCard = document.querySelector('.card[data-idx="' + pendingIdx + '"]');
      if (pendingCard) { pendingCard.classList.add('selected'); pendingCard.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      state.rsbSelectedId = pendingId;
      loadRsbDetail(pendingId);
    }
  }
  if (state._pendingLightboxId) {
    var lbPendingId = state._pendingLightboxId;
    state._pendingLightboxId = null;
    var lbIdx = state.images.findIndex(function(im) { return im.id === lbPendingId; });
    if (lbIdx >= 0) openLightbox(lbIdx);
  }
}

function loadMore() { loadImages(); }

function renderImages(newImages) {
  const grid = $('grid');
  const startIdx = state.images.length - newImages.length;
  var li = state.licenseInfo || {};
  var tier = li.tier || 'free';
  var maxFree = 500;
  var isFreeTier = (tier === 'free');
  newImages.forEach((img, i) => {
    const idx = startIdx + i;
    const isLocked = isFreeTier && idx >= maxFree;
    const card = document.createElement('div');
    card.className = 'card' + (isLocked ? ' locked' : '') + (img.inAlbum ? ' in-album' : '');
    card.dataset.idx = idx;
    if (!isLocked) {
      card.draggable = true;
      card.ondragstart = function(e) {
        // Drag selected images or just this one
        var ids = state.batchMode && state.selectedImages.size ? Array.from(state.selectedImages).map(function(si) { return state.images[si].id; }) : [img.id];
        e.dataTransfer.setData('application/pluto-image-ids', JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'copy';
      };
      card.onclick = function(e) {
        if (state.batchMode) { toggleBatchSelect(idx); return; }
        // Single click: select and show details in right sidebar
        document.querySelectorAll('.card.selected').forEach(function(c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        state.rsbSelectedId = img.id;
        loadRsbDetail(img.id);
      };
      card.ondblclick = function(e) { openLightbox(idx); };
      card.oncontextmenu = function(e) { showContextMenu(e, idx); };
    } else {
      card.onclick = function(e) { showLicenseModal(); };
    }

    if (img.isVideo) {
      card.innerHTML = '<img src="' + img.thumbUrl + '" loading="lazy"/><div class="badge">▶ Video</div>';
    } else if (img.isPdf) {
      card.innerHTML = '<img src="' + img.thumbUrl + '" loading="lazy"/><div class="badge">PDF</div>';
    } else {
      card.innerHTML = '<img src="' + img.thumbUrl + '" loading="lazy"/>';
    }
    card.innerHTML += '<div class="name-overlay">' + esc(img.name) + '</div>';

    // Locked overlay for images past free limit
    if (isLocked) {
      card.innerHTML += '<div class="locked-overlay"><svg class="lock-icon-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg><span class="lock-text">Upgrade to Pro</span></div>';
    }

    // In-album badge
    if (img.inAlbum && !isLocked) {
      card.innerHTML += '<div class="album-badge">✓ In Album</div>';
    }

    grid.appendChild(card);
  });

}

// ── Infinite scroll ──
$('gallery').addEventListener('scroll', () => {
  const el = $('gallery');
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
    if (!state.loading && state.offset < state.total) loadImages();
  }
});

// ── Lightbox ──
function openLightbox(idx) {
  state.lbIndex = idx;
  renderLightbox();
  $('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function openLightboxById(imageId) {
  var idx = state.images.findIndex(img => img.id === imageId);
  if (idx >= 0) { openLightbox(idx); return; }
  // If not in current gallery, show media directly
  window.open('/api/media/' + imageId, '_blank');
}

function closeLightbox() {
  $('lightbox').classList.remove('open');
  $('lightbox').classList.remove('above-overlay');
  document.body.style.overflow = '';
  // Restore gallery state if lightbox was opened from map
  if (_savedGalleryState) {
    state.images = _savedGalleryState.images;
    state.offset = _savedGalleryState.offset;
    state.total = _savedGalleryState.total;
    _savedGalleryState = null;
  }
  // Stop any playing video
  const v = $('lb-content').querySelector('video');
  if (v) v.pause();
}

function lbNav(dir) {
  const newIdx = state.lbIndex + dir;
  if (newIdx < 0 || newIdx >= state.images.length) return;
  // Stop current video before navigating
  const v = $('lb-content').querySelector('video');
  if (v) v.pause();
  state.lbIndex = newIdx;
  renderLightbox();
  // Pre-load more if near end
  if (newIdx > state.images.length - 10 && state.offset < state.total && !state.loading) loadImages();
}

function renderLightbox() {
  const img = state.images[state.lbIndex];
  if (!img) return;
  const content = $('lb-content');

  if (img.isVideo) {
    content.innerHTML = '<video src="' + img.mediaUrl + '" controls autoplay playsinline style="max-width:95vw;max-height:85vh"></video>';
  } else {
    content.innerHTML = '<img src="' + img.mediaUrl + '"/>';
  }

  $('lb-info').textContent = esc(img.name) + '  ·  ' + (state.lbIndex + 1) + ' / ' + state.images.length;

  // Update download link
  const dlBtn = $('lb-download');
  dlBtn.href = '/api/download/' + img.id;
  dlBtn.download = img.name || 'photo';

  // Load metadata
  $('lb-meta').classList.remove('show');
  api('/api/metadata/' + img.id).then(meta => {
    if (state.images[state.lbIndex]?.id !== img.id) return; // navigated away
    let html = '';
    if (meta.dimensions && meta.dimensions !== 'Unknown') html += '<div>📐 ' + meta.dimensions + '</div>';
    if (meta.size) html += '<div>💾 ' + meta.size + '</div>';
    if (meta.dateTaken && meta.dateTaken !== 'N/A') html += '<div>📅 ' + meta.dateTaken + '</div>';
    if (meta.camera && meta.camera !== 'N/A') html += '<div>📷 ' + meta.camera + '</div>';
    if (html) { $('lb-meta').innerHTML = html; $('lb-meta').classList.add('show'); }
  }).catch(() => {});
  if (state.detailOpen) loadImageDetails(img.id);
}

// Keyboard navigation
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    // Close lightbox first (it may be above a feature overlay)
    if ($('lightbox').classList.contains('open')) { closeLightbox(); return; }
    // Then close feature overlays
    if ($('people-overlay').classList.contains('open')) { closePeoplePanel(); return; }
    if ($('map-overlay').classList.contains('open')) { closeMapView(); return; }
    if ($('dup-overlay').classList.contains('open')) { closeDupFinder(); return; }
    if ($('import-overlay').classList.contains('open')) { closeCloudImport(); return; }
    return;
  }
  if (!$('lightbox').classList.contains('open')) return;
  if (e.key === 'ArrowLeft') lbNav(-1);
  if (e.key === 'ArrowRight') lbNav(1);
});

// Touch swipe for lightbox
let touchStartX = 0;
$('lightbox').addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, {passive:true});
$('lightbox').addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 50) lbNav(dx > 0 ? -1 : 1);
}, {passive:true});

// ── Init ──
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('pluto-theme', t);
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.themeVal === t);
  });
}
(function initTheme() {
  const saved = localStorage.getItem('pluto-theme') || 'cyber';
  setTheme(saved);
})();

// ── Slideshow ──
const SS_DURATIONS = [{label:'2s',value:2},{label:'4s',value:4},{label:'6s',value:6},{label:'8s',value:8},{label:'10s',value:10},{label:'15s',value:15},{label:'30s',value:30}];
const SS_TRANSITIONS = [{label:'Fade',value:'fade'},{label:'Slide',value:'slide'},{label:'Zoom',value:'zoom'},{label:'None',value:'none'}];
const SS_FITS = [{label:'Fit',value:'contain'},{label:'Fill',value:'cover'}];

function loadSlideshowSettings() {
  try {
    const saved = localStorage.getItem('ss-settings');
    if (saved) {
      const s = JSON.parse(saved);
      state.ssDuration = s.duration || 4;
      state.ssTransition = s.transition || 'fade';
      state.ssShuffle = !!s.shuffle;
      state.ssLoop = s.loop !== false;
      state.ssShowInfo = !!s.showInfo;
      state.ssFit = s.fit || 'contain';
      state.ssInterval = state.ssDuration * 1000;
    }
  } catch(e) {}
}

function saveSlideshowSettings() {
  localStorage.setItem('ss-settings', JSON.stringify({
    duration: state.ssDuration, transition: state.ssTransition,
    shuffle: state.ssShuffle, loop: state.ssLoop,
    showInfo: state.ssShowInfo, fit: state.ssFit
  }));
}

function renderPills(containerId, items, current, onSelect) {
  const c = $(containerId);
  c.innerHTML = items.map(it =>
    '<span class="ss-pill' + (it.value == current ? ' active' : '') + '" data-v="' + it.value + '">' + it.label + '</span>'
  ).join('');
  c.querySelectorAll('.ss-pill').forEach(pill => {
    pill.onclick = () => {
      c.querySelectorAll('.ss-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      onSelect(isNaN(pill.dataset.v) ? pill.dataset.v : Number(pill.dataset.v));
    };
  });
}

function openSlideshowSettings() {
  state.ssPausedBySettings = false;
  if (state.ssRunning && !state.ssPaused) {
    state.ssPausedBySettings = true;
    toggleSlideshowPause();
  }
  renderPills('ss-dur-pills', SS_DURATIONS, state.ssDuration, v => {
    state.ssDuration = v; state.ssInterval = v * 1000; saveSlideshowSettings();
  });
  renderPills('ss-trans-pills', SS_TRANSITIONS, state.ssTransition, v => {
    state.ssTransition = v; saveSlideshowSettings();
  });
  renderPills('ss-fit-pills', SS_FITS, state.ssFit, v => {
    state.ssFit = v; saveSlideshowSettings();
    if (state.ssRunning) applyFitMode();
  });
  $('ss-shuffle').checked = state.ssShuffle;
  $('ss-loop').checked = state.ssLoop;
  $('ss-show-info').checked = state.ssShowInfo;
  $('ss-shuffle').onchange = function() { state.ssShuffle = this.checked; saveSlideshowSettings(); };
  $('ss-loop').onchange = function() { state.ssLoop = this.checked; saveSlideshowSettings(); };
  $('ss-show-info').onchange = function() {
    state.ssShowInfo = this.checked; saveSlideshowSettings();
    if (state.ssRunning) updateSlideshowInfo();
  };
  $('ss-start-btn').innerHTML = state.ssRunning ? '✕ Close Settings' : '▶ Start Slideshow';
  $('ss-start-btn').onclick = state.ssRunning ? closeSlideshowSettings : launchSlideshow;
  $('ss-settings-overlay').classList.add('open');
}

function closeSlideshowSettings() {
  $('ss-settings-overlay').classList.remove('open');
  if (state.ssRunning && state.ssPausedBySettings) {
    state.ssPausedBySettings = false;
    toggleSlideshowPause();
  }
}

function buildShuffledOrder(len) {
  const arr = Array.from({length: len}, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getSSImageIndex() {
  if (state.ssShuffle && state.ssOrder.length) return state.ssOrder[state.ssIndex % state.ssOrder.length];
  return state.ssIndex;
}

function startSlideshow() {
  loadSlideshowSettings();
  openSlideshowSettings();
}

function launchSlideshow() {
  closeSlideshowSettings();
  if (state.images.length === 0) return;
  state.ssRunning = true;
  state.ssPaused = false;
  state.ssIndex = 0;
  state.ssActiveLayer = 'a';
  state.ssInterval = state.ssDuration * 1000;
  if (state.ssShuffle) state.ssOrder = buildShuffledOrder(state.images.length);
  $('ss-layer-a').innerHTML = ''; $('ss-layer-a').className = 'ss-layer';
  $('ss-layer-b').innerHTML = ''; $('ss-layer-b').className = 'ss-layer';
  $('slideshow').classList.add('open');
  $('ss-pause').textContent = '⏸';
  document.body.style.overflow = 'hidden';
  renderSlideshowFrame();
  scheduleSlideshowNext();
}

function stopSlideshow() {
  state.ssRunning = false;
  clearTimeout(state.ssTimer);
  $('slideshow').classList.remove('open');
  $('ss-settings-overlay').classList.remove('open');
  document.body.style.overflow = '';
  $('ss-layer-a').innerHTML = ''; $('ss-layer-b').innerHTML = '';
}

function toggleSlideshowPause() {
  state.ssPaused = !state.ssPaused;
  $('ss-pause').textContent = state.ssPaused ? '▶' : '⏸';
  if (!state.ssPaused) scheduleSlideshowNext();
  else clearTimeout(state.ssTimer);
}

function applyFitMode() {
  document.querySelectorAll('.ss-layer img,.ss-layer video').forEach(el => {
    el.style.objectFit = state.ssFit;
  });
}

function scheduleSlideshowNext() {
  clearTimeout(state.ssTimer);
  if (!state.ssRunning || state.ssPaused) return;
  const bar = $('ss-progress');
  bar.style.transition = 'none';
  bar.style.width = '0%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bar.style.transition = 'width ' + (state.ssInterval / 1000) + 's linear';
      bar.style.width = '100%';
    });
  });
  state.ssTimer = setTimeout(() => advanceSlideshow(1), state.ssInterval);
}

function advanceSlideshow(dir) {
  clearTimeout(state.ssTimer);
  state.ssIndex += dir;
  const total = state.images.length;
  if (state.ssIndex >= total) {
    if (state.offset < state.total) {
      loadImages().then(() => {
        if (state.ssShuffle) {
          const oldLen = state.ssOrder.length;
          const extra = Array.from({length: state.images.length - oldLen}, (_, i) => oldLen + i);
          for (let i = extra.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [extra[i],extra[j]]=[extra[j],extra[i]]; }
          state.ssOrder = state.ssOrder.concat(extra);
        }
        if (state.ssIndex >= state.images.length) {
          if (state.ssLoop) { state.ssIndex = 0; } else { stopSlideshow(); return; }
        }
        transitionToFrame();
        if (!state.ssPaused) scheduleSlideshowNext();
      });
      return;
    }
    if (state.ssLoop) {
      state.ssIndex = 0;
      if (state.ssShuffle) state.ssOrder = buildShuffledOrder(total);
    } else { stopSlideshow(); return; }
  }
  if (state.ssIndex < 0) state.ssIndex = total - 1;
  transitionToFrame();
  if (!state.ssPaused) scheduleSlideshowNext();
}

function setLayerContent(layer, img) {
  if (img.isVideo) {
    layer.innerHTML = '<video src="' + img.mediaUrl + '" autoplay muted playsinline style="object-fit:' + state.ssFit + '"></video>';
  } else {
    layer.innerHTML = '<img src="' + img.mediaUrl + '" style="object-fit:' + state.ssFit + '"/>';
  }
}

function renderSlideshowFrame() {
  const imgIdx = getSSImageIndex();
  const img = state.images[imgIdx];
  if (!img) return;
  const layer = $('ss-layer-' + state.ssActiveLayer);
  setLayerContent(layer, img);
  layer.className = 'ss-layer active';
  if (state.ssTransition === 'zoom') {
    layer.classList.add('zoom');
    layer.style.setProperty('--ss-dur', state.ssDuration + 's');
  }
  updateSlideshowInfo();
}

function transitionToFrame() {
  const imgIdx = getSSImageIndex();
  const img = state.images[imgIdx];
  if (!img) return;
  const curId = state.ssActiveLayer;
  const nextId = curId === 'a' ? 'b' : 'a';
  const curLayer = $('ss-layer-' + curId);
  const nextLayer = $('ss-layer-' + nextId);
  setLayerContent(nextLayer, img);
  const t = state.ssTransition;
  // Clean up previous animations
  nextLayer.className = 'ss-layer';
  if (t === 'none') {
    curLayer.className = 'ss-layer';
    nextLayer.className = 'ss-layer active';
  } else if (t === 'fade') {
    nextLayer.classList.add('fade');
    curLayer.classList.add('fade');
    nextLayer.offsetHeight; // reflow
    nextLayer.classList.add('active');
    curLayer.classList.remove('active');
  } else if (t === 'slide') {
    curLayer.className = 'ss-layer active slide-exit';
    nextLayer.className = 'ss-layer slide-enter';
    nextLayer.addEventListener('animationend', () => {
      curLayer.className = 'ss-layer';
      nextLayer.className = 'ss-layer active';
    }, {once: true});
  } else if (t === 'zoom') {
    nextLayer.classList.add('fade', 'zoom');
    nextLayer.style.setProperty('--ss-dur', state.ssDuration + 's');
    curLayer.classList.add('fade');
    nextLayer.offsetHeight;
    nextLayer.classList.add('active');
    curLayer.classList.remove('active');
  }
  state.ssActiveLayer = nextId;
  updateSlideshowInfo();
}

function updateSlideshowInfo() {
  const imgIdx = getSSImageIndex();
  const img = state.images[imgIdx];
  const info = $('ss-info');
  if (state.ssShowInfo && img) {
    let text = img.name || '';
    if (img.dateTaken) text += (text ? ' · ' : '') + new Date(img.dateTaken).toLocaleDateString();
    info.textContent = text;
    info.classList.add('visible');
  } else {
    info.classList.remove('visible');
  }
  $('ss-counter').textContent = (state.ssIndex + 1) + ' / ' + state.images.length;
}

function ssNav(dir) {
  advanceSlideshow(dir);
}

// Slideshow keyboard controls
document.addEventListener('keydown', e => {
  if (!state.ssRunning) return;
  if (e.key === 'Escape') {
    if ($('ss-settings-overlay').classList.contains('open')) closeSlideshowSettings();
    else stopSlideshow();
  }
  if (e.key === ' ') { e.preventDefault(); toggleSlideshowPause(); }
  if (e.key === 'ArrowRight') advanceSlideshow(1);
  if (e.key === 'ArrowLeft') advanceSlideshow(-1);
});

// ── Management Functions ──
function toggleDetailPanel() {
  state.detailOpen = !state.detailOpen;
  $('lb-detail').classList.toggle('open', state.detailOpen);
  $('lb-detail-toggle').classList.toggle('active', state.detailOpen);
  if (state.detailOpen && state.images[state.lbIndex]) loadImageDetails(state.images[state.lbIndex].id);
}
function loadImageDetails(id) {
  if (!id) return;
  api('/api/image-details/' + id).then(function(detail) { state.currentDetail = detail; renderDetailPanel(detail); }).catch(function(e) { console.error('Failed to load details', e); });
}
function renderDetailPanel(d) {
  var ratingHtml = '';
  for (var i = 1; i <= 5; i++) ratingHtml += '<span class="star' + (i <= d.rating ? ' filled' : '') + '" onclick="setRating(' + d.id + ',' + i + ')" onmouseenter="hoverStars(' + i + ')" onmouseleave="unhoverStars()">' + (i <= d.rating ? '\u2605' : '\u2606') + '</span>';
  $('detail-rating').innerHTML = ratingHtml;
  var colors = [{n:'',l:'None',h:'transparent'},{n:'red',l:'Red',h:'#ef4444'},{n:'orange',l:'Orange',h:'#f97316'},{n:'yellow',l:'Yellow',h:'#eab308'},{n:'green',l:'Green',h:'#22c55e'},{n:'blue',l:'Blue',h:'#3b82f6'},{n:'purple',l:'Purple',h:'#a855f7'}];
  $('detail-colors').innerHTML = colors.map(function(c) { return '<div class="color-dot' + (d.colorLabel === c.n ? ' active' : '') + '" style="background:' + (c.h === 'transparent' ? 'var(--bg-input)' : c.h) + '" title="' + c.l + '" onclick="setColorLabel(' + d.id + ',\\\'' + c.n + '\\\')"></div>'; }).join('');
  $('detail-tags').innerHTML = d.tags.map(function(t) { return '<span class="tag-chip">' + esc(t) + '<span class="remove-tag" data-tag="' + encodeURIComponent(t) + '" onclick="removeTagByEl(this,' + d.id + ')">\u2715</span></span>'; }).join('');
  $('detail-albums').innerHTML = d.albums.map(function(a) { return '<span class="album-chip">' + esc(a.name) + '<span class="remove-album" onclick="removeFromAlbumDetail(' + d.id + ',' + a.id + ')">\u2715</span></span>'; }).join('');
}
function hoverStars(n) { $('detail-rating').querySelectorAll('.star').forEach(function(s, i) { s.classList.toggle('hover', i < n); s.textContent = i < n ? '\u2605' : '\u2606'; }); }
function unhoverStars() { if (!state.currentDetail) return; var r = state.currentDetail.rating; $('detail-rating').querySelectorAll('.star').forEach(function(s, i) { s.classList.remove('hover'); s.classList.toggle('filled', i < r); s.textContent = i < r ? '\u2605' : '\u2606'; }); }
function setRating(imageId, rating) {
  if (state.currentDetail && state.currentDetail.rating === rating) rating = 0;
  postApi('/api/set-rating', { imageId: imageId, rating: rating }).then(function(result) {
    if (result.success) { state.currentDetail.rating = rating; renderDetailPanel(state.currentDetail); toast('Rating updated'); }
    else toast(result.error || 'Failed', 'error');
  });
}
function setColorLabel(imageId, colorLabel) {
  if (state.currentDetail && state.currentDetail.colorLabel === colorLabel) colorLabel = '';
  postApi('/api/set-color-label', { imageId: imageId, colorLabel: colorLabel }).then(function(result) {
    if (result.success) { state.currentDetail.colorLabel = colorLabel; renderDetailPanel(state.currentDetail); toast(colorLabel ? 'Label: ' + colorLabel : 'Label removed'); }
    else toast(result.error || 'Failed', 'error');
  });
}
function addTagFromInput() {
  var input = $('tag-input'); var tag = input.value.trim();
  if (!tag || !state.currentDetail) return;
  postApi('/api/add-tag', { imageId: state.currentDetail.id, tag: tag }).then(function(result) {
    if (result.success) { if (state.currentDetail.tags.indexOf(tag) === -1) state.currentDetail.tags.push(tag); renderDetailPanel(state.currentDetail); input.value = ''; toast('Tag added'); }
    else toast(result.error || 'Failed', 'error');
  });
}
function removeTagByEl(el, imageId) {
  var tag = decodeURIComponent(el.dataset.tag);
  postApi('/api/remove-tag', { imageId: imageId, tag: tag }).then(function(result) {
    if (result.success) { state.currentDetail.tags = state.currentDetail.tags.filter(function(t) { return t !== tag; }); renderDetailPanel(state.currentDetail); toast('Tag removed'); }
    else toast(result.error || 'Failed', 'error');
  });
}
function removeFromAlbumDetail(imageId, albumId) {
  postApi('/api/remove-from-album', { albumId: albumId, imageIds: [imageId] }).then(function(result) {
    if (result.success) { state.currentDetail.albums = state.currentDetail.albums.filter(function(a) { return a.id !== albumId; }); renderDetailPanel(state.currentDetail); toast('Removed from album'); loadSidebar(); }
    else toast(result.error || 'Failed', 'error');
  });
}
function showModal(html) { $('modal-box').innerHTML = html; $('modal-overlay').classList.add('open'); }
function closeModal() { $('modal-overlay').classList.remove('open'); }
function showImportFolderModal() {
  showModal('<h3>Import Folder <button onclick="closeModal()">\u2715</button></h3>' +
    '<p style="color:var(--text-muted);font-size:12px;margin:0 0 12px">Enter the absolute path to a directory <strong>inside the Docker container</strong>.<br>Make sure the path is mounted as a volume.</p>' +
    '<div class="modal-field"><label>Folder Path</label><input id="import-folder-path" placeholder="/photos/my-folder"></div>' +
    '<div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button><button class="modal-btn modal-btn-primary" onclick="doImportFolder()">Import</button></div>');
  setTimeout(function() { var el = $('import-folder-path'); if (el) el.focus(); }, 100);
}
function doImportFolder() {
  var folderPath = $('import-folder-path') ? $('import-folder-path').value.trim() : '';
  if (!folderPath) { toast('Enter a folder path', 'error'); return; }
  var btn = document.querySelector('.modal-btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing...'; }
  postApi('/api/import-folder', { folderPath: folderPath }).then(function(result) {
    if (result.success) {
      closeModal();
      toast('Imported folder: ' + (result.added || 0) + ' new, ' + (result.removed || 0) + ' removed', 'success');
      loadSidebar();
      resetAndLoad();
    } else {
      toast(result.error || 'Import failed', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Import'; }
    }
  }).catch(function(e) {
    toast('Import failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Import'; }
  });
}

function showCreateProjectModal() {
  showModal('<h3>New Project <button onclick="closeModal()">\u2715</button></h3><div class="modal-field"><label>Project Name</label><input id="new-project-name" placeholder="My Project"></div><div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button><button class="modal-btn modal-btn-primary" onclick="createProject()">Create</button></div>');
  setTimeout(function() { var el = $('new-project-name'); if (el) el.focus(); }, 100);
}
function createProject() {
  var name = $('new-project-name') ? $('new-project-name').value.trim() : '';
  if (!name) return;
  postApi('/api/create-project', { name: name }).then(function(result) { if (result.success) { closeModal(); toast('Project created', 'success'); loadSidebar(); } else toast(result.error || 'Failed', 'error'); });
}
function confirmDeleteProject(id, name) {
  showModal('<h3>Delete Project <button onclick="closeModal()">\u2715</button></h3><p style="color:var(--text-dim);font-size:13px;margin-bottom:16px">Delete "' + esc(name) + '" and all its albums?</p><div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button><button class="modal-btn modal-btn-danger" onclick="deleteProject(' + id + ')">Delete</button></div>');
}
function deleteProject(id) { postApi('/api/delete-project', { id: id }).then(function(result) { if (result.success) { closeModal(); toast('Project deleted', 'success'); loadSidebar(); } else toast(result.error || 'Failed', 'error'); }); }
function showCreateAlbumModal(projectId) {
  var opts = state.projects.map(function(p) { return '<option value="' + p.id + '"' + (p.id == projectId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
  showModal('<h3>New Album <button onclick="closeModal()">\u2715</button></h3><div class="modal-field"><label>Project</label><select id="new-album-project">' + opts + '</select></div><div class="modal-field"><label>Album Name</label><input id="new-album-name" placeholder="My Album"></div><div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button><button class="modal-btn modal-btn-primary" onclick="createAlbum()">Create</button></div>');
  setTimeout(function() { var el = $('new-album-name'); if (el) el.focus(); }, 100);
}
function createAlbum() {
  var name = $('new-album-name') ? $('new-album-name').value.trim() : '';
  var projectId = $('new-album-project') ? $('new-album-project').value : '';
  if (!name || !projectId) return;
  postApi('/api/create-album', { name: name, projectId: Number(projectId) }).then(function(result) { if (result.success) { closeModal(); toast('Album created', 'success'); loadSidebar(); } else toast(result.error || 'Failed', 'error'); });
}
function confirmDeleteAlbum(id, name) {
  showModal('<h3>Delete Album <button onclick="closeModal()">\u2715</button></h3><p style="color:var(--text-dim);font-size:13px;margin-bottom:16px">Delete "' + esc(name) + '"? Photos will not be removed.</p><div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button><button class="modal-btn modal-btn-danger" onclick="deleteAlbum(' + id + ')">Delete</button></div>');
}
function deleteAlbum(id) {
  postApi('/api/delete-album', { id: id }).then(function(result) { if (result.success) { closeModal(); toast('Album deleted', 'success'); loadSidebar(); if (state.view === 'album' && state.albumId == id) selectUnsorted(); } else toast(result.error || 'Failed', 'error'); });
}
function showAddToAlbumModal(imageIds) {
  if (!imageIds) imageIds = state.rsbDetail ? [state.rsbDetail.id] : (state.currentDetail ? [state.currentDetail.id] : []);
  if (!imageIds.length) return;
  var html = '<h3>Add to Album <button onclick="closeModal()">\u2715</button></h3>';
  if (!state.projects.length) { html += '<p style="color:var(--text-dim);font-size:13px">No albums yet. Create a project first.</p>'; }
  else {
    html += '<div style="max-height:300px;overflow-y:auto">';
    state.projects.forEach(function(p) {
      if (p.albums && p.albums.length) {
        html += '<div style="font-size:11px;color:var(--text-muted);padding:8px 0 4px;font-weight:600">' + esc(p.name) + '</div>';
        p.albums.forEach(function(a) {
          html += '<div class="ctx-item" data-album-id="' + a.id + '" data-album-name="' + esc(a.name) + '" data-image-ids="' + imageIds.join(',') + '" onclick="addToAlbumFromEl(this)">\ud83d\udcc1 ' + esc(a.name) + ' <span style="margin-left:auto;font-size:11px;color:var(--text-muted)">' + (a.imageCount||0) + '</span></div>';
        });
      }
    });
    html += '</div>';
  }
  html += '<div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button></div>';
  showModal(html);
}
// ── Drag & Drop onto albums ──
function handleAlbumDragOver(e, el) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  el.classList.add('drop-target');
}
function handleAlbumDragLeave(e, el) {
  // Only remove highlight if actually leaving (not entering a child)
  var related = e.relatedTarget;
  if (!related || !el.contains(related)) {
    el.classList.remove('drop-target');
  }
}
function handleAlbumDrop(e, el) {
  e.preventDefault();
  el.classList.remove('drop-target');
  var raw = e.dataTransfer.getData('application/pluto-image-ids');
  if (!raw) return;
  try {
    var imageIds = JSON.parse(raw);
    if (!imageIds || !imageIds.length) return;
    var albumId = Number(el.dataset.albumId);
    var albumName = el.dataset.albumName || '';
    postApi('/api/add-to-album', { albumId: albumId, imageIds: imageIds }).then(function(result) {
      if (result.success) {
        toast('Added ' + imageIds.length + ' image(s) to "' + albumName + '"', 'success');
        loadSidebar();
        if (state.rsbDetail) loadRsbDetail(state.rsbDetail.id);
        if (state.currentDetail) loadImageDetails(state.currentDetail.id);
        imageIds.forEach(function(id) { updateCardAlbumBadge(id, true); });
      } else {
        toast(result.error || 'Drop failed', 'error');
      }
    });
  } catch (err) {
    console.error('Drop failed:', err);
  }
}

function addToAlbumFromEl(el) {
  var albumId = Number(el.dataset.albumId); var albumName = el.dataset.albumName;
  var imageIds = el.dataset.imageIds.split(',').map(Number);
  postApi('/api/add-to-album', { albumId: albumId, imageIds: imageIds }).then(function(result) {
    if (result.success) {
      closeModal(); toast('Added ' + imageIds.length + ' image(s) to "' + albumName + '"', 'success'); loadSidebar();
      if (state.rsbDetail) loadRsbDetail(state.rsbDetail.id);
      if (state.currentDetail) loadImageDetails(state.currentDetail.id);
      // Live-update card album badges
      imageIds.forEach(function(id) { updateCardAlbumBadge(id, true); });
    }
    else toast(result.error || 'Failed', 'error');
  });
}
function showSmartAlbumModal(existing) {
  var isEdit = !!existing; var name = existing ? existing.name : ''; var icon = existing ? (existing.icon || '\ud83d\udd0d') : '\ud83d\udd0d';
  var rules = existing ? (typeof existing.rules === 'string' ? JSON.parse(existing.rules) : existing.rules) : [];
  var html = '<h3>' + (isEdit ? 'Edit' : 'New') + ' Smart Album <button onclick="closeModal()">\u2715</button></h3>';
  html += '<div class="modal-field"><label>Name</label><input id="sa-name" value="' + esc(name) + '" placeholder="Smart Album Name"></div>';
  html += '<div class="modal-field"><label>Icon</label><input id="sa-icon" value="' + esc(icon) + '" style="width:80px"></div>';
  html += '<div class="modal-field"><label>Rules</label><div class="sa-rules" id="sa-rules"></div><div class="add-rule-btn" onclick="addSmartAlbumRule()">+ Add Rule</div></div>';
  html += '<div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button>';
  if (isEdit) html += '<button class="modal-btn modal-btn-danger" onclick="deleteSmartAlbum(' + existing.id + ')">Delete</button>';
  html += '<button class="modal-btn modal-btn-primary" onclick="saveSmartAlbum(' + (isEdit ? existing.id : 'null') + ')">Save</button></div>';
  showModal(html);
  window._saRules = rules.length ? rules : [{ field: 'rating', operator: 'gte', value: '4' }];
  renderSmartAlbumRules();
}
function renderSmartAlbumRules() {
  var container = $('sa-rules'); if (!container) return;
  var fields = [{v:'rating',l:'Rating'},{v:'color_label',l:'Color Label'},{v:'tag',l:'Tag'},{v:'name',l:'Filename'},{v:'file_type',l:'File Type'}];
  var ops = [{v:'eq',l:'equals'},{v:'neq',l:'not equals'},{v:'gt',l:'>'},{v:'gte',l:'>='},{v:'lt',l:'<'},{v:'lte',l:'<='},{v:'contains',l:'contains'}];
  container.innerHTML = window._saRules.map(function(r, i) {
    return '<div class="sa-rule"><select onchange="window._saRules[' + i + '].field=this.value">' + fields.map(function(f) { return '<option value="' + f.v + '"' + (r.field === f.v ? ' selected' : '') + '>' + f.l + '</option>'; }).join('') + '</select>' +
      '<select onchange="window._saRules[' + i + '].operator=this.value">' + ops.map(function(o) { return '<option value="' + o.v + '"' + (r.operator === o.v ? ' selected' : '') + '>' + o.l + '</option>'; }).join('') + '</select>' +
      '<input value="' + esc(r.value || '') + '" onchange="window._saRules[' + i + '].value=this.value" placeholder="Value">' +
      '<button class="remove-rule" onclick="removeSmartAlbumRule(' + i + ')">\u2715</button></div>';
  }).join('');
}
function addSmartAlbumRule() { window._saRules.push({ field: 'rating', operator: 'gte', value: '' }); renderSmartAlbumRules(); }
function removeSmartAlbumRule(i) { window._saRules.splice(i, 1); renderSmartAlbumRules(); }
function saveSmartAlbum(id) {
  var name = $('sa-name') ? $('sa-name').value.trim() : ''; var icon = $('sa-icon') ? $('sa-icon').value.trim() : '\ud83d\udd0d';
  if (!name) { toast('Name is required', 'error'); return; }
  if (!window._saRules.length) { toast('Add at least one rule', 'error'); return; }
  var url = id ? '/api/update-smart-album' : '/api/create-smart-album';
  var body = id ? { id: id, name: name, rules: window._saRules, icon: icon } : { name: name, rules: window._saRules, icon: icon };
  postApi(url, body).then(function(result) { if (result.success) { closeModal(); toast('Smart album saved', 'success'); loadSidebar(); } else toast(result.error || 'Failed', 'error'); });
}
function deleteSmartAlbum(id) { postApi('/api/delete-smart-album', { id: id }).then(function(result) { if (result.success) { closeModal(); toast('Deleted', 'success'); loadSidebar(); if (state.view === 'smart-album' && state.smartAlbumId == id) selectUnsorted(); } else toast(result.error || 'Failed', 'error'); }); }
function loadLicenseInfo() { api('/api/license-info').then(function(info) { state.licenseInfo = info; renderLicensePanel(); updateToolbar(); renderRightSidebar(); }).catch(function() {}); }
function renderLicensePanel() {
  var li = state.licenseInfo; if (!li) return; var panel = $('license-panel'); if (!panel) return;
  var tier = li.tier || 'free'; var tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  var badgeClass = li.freeTrial ? 'trial' : tier;
  var html = '<span class="license-badge ' + badgeClass + '">' + (li.freeTrial ? '\ud83d\udd50 Trial' : tierLabel) + '</span>';
  if (tier === 'free' || li.freeTrial) html += '<button class="license-btn" onclick="showLicenseModal()">Upgrade</button>';
  panel.innerHTML = html;
}
function showLicenseModal() {
  var li = state.licenseInfo || {}; var tier = li.tier || 'free';
  var html = '<h3>License <button onclick="closeModal()">\u2715</button></h3>';
  html += '<div style="margin-bottom:16px;padding:12px;background:var(--bg-input);border-radius:8px"><div style="font-size:12px;color:var(--text-dim)">Current Plan</div><div style="font-size:18px;font-weight:700;color:var(--text-heading)">' + (tier.charAt(0).toUpperCase() + tier.slice(1)) + '</div>';
  if (li.freeTrial && li.trialEnd) { var days = Math.max(0, Math.ceil((new Date(li.trialEnd) - Date.now()) / 86400000)); html += '<div style="font-size:12px;color:#fbbf24">' + days + ' days remaining</div>'; }
  html += '</div>';
  html += '<div class="modal-field"><label>Email</label><input id="license-email" type="email" placeholder="your@email.com"></div>';
  html += '<div class="modal-field"><label>License Key</label><input id="license-key" placeholder="XXXX-XXXX-XXXX-XXXX"></div>';
  html += '<div class="modal-actions">';
  if (tier === 'free' && !li.freeTrial) html += '<button class="modal-btn modal-btn-secondary" onclick="startTrial()">Start Free Trial</button>';
  if (tier !== 'free') html += '<button class="modal-btn modal-btn-danger" onclick="deactivateLicense()">Deactivate</button>';
  html += '<button class="modal-btn modal-btn-primary" onclick="activateLicense()">Activate</button></div>';
  html += '<div style="text-align:center;margin-top:12px"><a href="https://plutophotos.com/#pricing" target="_blank" style="color:var(--accent);font-size:12px">Buy a license at plutophotos.com</a></div>';
  showModal(html);
}
function activateLicense() {
  var email = $('license-email') ? $('license-email').value.trim() : ''; var key = $('license-key') ? $('license-key').value.trim() : '';
  if (!email || !key) { toast('Enter email and license key', 'error'); return; }
  postApi('/api/activate-license', { email: email, licenseKey: key }).then(function(result) { if (result.success) { closeModal(); toast('License activated!', 'success'); loadLicenseInfo(); } else toast(result.error || 'Activation failed', 'error'); });
}
function deactivateLicense() { postApi('/api/deactivate-license', {}).then(function(result) { if (result.success) { closeModal(); toast('License deactivated', 'success'); loadLicenseInfo(); } else toast(result.error || 'Failed', 'error'); }); }
function startTrial() {
  var email = $('license-email') ? $('license-email').value.trim() : '';
  if (!email) { toast('Enter your email', 'error'); return; }
  postApi('/api/start-trial', { email: email }).then(function(result) { if (result.success) { closeModal(); toast('Free trial started!', 'success'); loadLicenseInfo(); } else toast(result.error || 'Failed', 'error'); });
}
function showContextMenu(e, idx) {
  e.preventDefault(); var img = state.images[idx]; if (!img) return;
  var menu = $('ctx-menu'); var html = '';
  html += '<div class="ctx-item" onclick="openLightbox(' + idx + ');hideContextMenu()">\ud83d\udd0d View</div>';
  html += '<div class="ctx-item" onclick="quickRate(' + idx + ')">\u2b50 Rate</div>';
  html += '<div class="ctx-item" onclick="quickAddToAlbum(' + idx + ')">\ud83d\udcc1 Add to Album</div>';
  html += '<div class="ctx-sep"></div>';
  html += '<div class="ctx-item" onclick="toggleBatchSelect(' + idx + ');hideContextMenu()">\u2611 Select</div>';
  if (state.view === 'album' && state.albumId) { html += '<div class="ctx-sep"></div><div class="ctx-item danger" onclick="removeFromCurrentAlbum(' + idx + ')">\ud83d\uddd1 Remove from Album</div>'; }
  menu.innerHTML = html;
  menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
  menu.classList.add('open');
  setTimeout(function() { document.addEventListener('click', hideContextMenu, { once: true }); }, 0);
}
function hideContextMenu() { $('ctx-menu').classList.remove('open'); }
function quickRate(idx) { hideContextMenu(); openLightbox(idx); setTimeout(function() { if (!state.detailOpen) toggleDetailPanel(); }, 100); }
function quickAddToAlbum(idx) { hideContextMenu(); var img = state.images[idx]; if (img) showAddToAlbumModal([img.id]); }
function removeFromCurrentAlbum(idx) {
  hideContextMenu(); var img = state.images[idx]; if (!img || !state.albumId) return;
  postApi('/api/remove-from-album', { albumId: state.albumId, imageIds: [img.id] }).then(function(result) { if (result.success) { toast('Removed', 'success'); resetAndLoad(); loadSidebar(); } else toast(result.error || 'Failed', 'error'); });
}
function toggleBatchSelect(idx) {
  if (!state.batchMode) { state.batchMode = true; $('batch-bar').classList.add('open'); }
  var img = state.images[idx]; if (!img) return;
  if (state.selectedImages.has(img.id)) state.selectedImages.delete(img.id); else state.selectedImages.add(img.id);
  var cards = document.querySelectorAll('.card'); if (cards[idx]) cards[idx].classList.toggle('selected', state.selectedImages.has(img.id));
  updateBatchCount();
}
function exitBatchMode() { state.batchMode = false; state.selectedImages.clear(); document.querySelectorAll('.card.selected').forEach(function(c) { c.classList.remove('selected'); }); $('batch-bar').classList.remove('open'); }
function updateBatchCount() { $('batch-count').textContent = state.selectedImages.size + ' selected'; }
function batchRate() {
  if (!state.selectedImages.size) { toast('No images selected', 'error'); return; }
  showModal('<h3>Set Rating <button onclick="closeModal()">\u2715</button></h3><div style="display:flex;gap:12px;justify-content:center;font-size:28px;margin:16px 0"><span style="cursor:pointer" onclick="executeBatchRate(1)">1\u2b50</span><span style="cursor:pointer" onclick="executeBatchRate(2)">2\u2b50</span><span style="cursor:pointer" onclick="executeBatchRate(3)">3\u2b50</span><span style="cursor:pointer" onclick="executeBatchRate(4)">4\u2b50</span><span style="cursor:pointer" onclick="executeBatchRate(5)">5\u2b50</span></div><div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button></div>');
}
function executeBatchRate(rating) { postApi('/api/batch-set-rating', { imageIds: Array.from(state.selectedImages), rating: rating }).then(function(result) { if (result.success) { closeModal(); toast('Rated ' + result.updated + ' images', 'success'); } else toast(result.error || 'Failed', 'error'); }); }
function batchColor() {
  if (!state.selectedImages.size) { toast('No images selected', 'error'); return; }
  var colors = [{n:'red',h:'#ef4444'},{n:'orange',h:'#f97316'},{n:'yellow',h:'#eab308'},{n:'green',h:'#22c55e'},{n:'blue',h:'#3b82f6'},{n:'purple',h:'#a855f7'},{n:'',h:'none'}];
  showModal('<h3>Set Color Label <button onclick="closeModal()">\u2715</button></h3><div style="display:flex;gap:12px;justify-content:center;margin:16px 0">' + colors.map(function(c) { return '<div class="color-dot" style="width:32px;height:32px;background:' + (c.h === 'none' ? 'var(--bg-input)' : c.h) + '" onclick="executeBatchColor(\\\'' + c.n + '\\\')"></div>'; }).join('') + '</div><div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button></div>');
}
function executeBatchColor(label) { postApi('/api/batch-set-color-label', { imageIds: Array.from(state.selectedImages), colorLabel: label }).then(function(result) { if (result.success) { closeModal(); toast('Labeled ' + result.updated + ' images', 'success'); } else toast(result.error || 'Failed', 'error'); }); }
function batchTag() {
  if (!state.selectedImages.size) { toast('No images selected', 'error'); return; }
  showModal('<h3>Add Tag <button onclick="closeModal()">\u2715</button></h3><div class="modal-field"><label>Tag</label><input id="batch-tag-input" placeholder="Enter tag name"></div><div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button><button class="modal-btn modal-btn-primary" onclick="executeBatchTag()">Add Tag</button></div>');
  setTimeout(function() { var el = $('batch-tag-input'); if (el) el.focus(); }, 100);
}
function executeBatchTag() { var tag = $('batch-tag-input') ? $('batch-tag-input').value.trim() : ''; if (!tag) return; postApi('/api/batch-add-tag', { imageIds: Array.from(state.selectedImages), tag: tag }).then(function(result) { if (result.success) { closeModal(); toast('Tagged ' + result.updated + ' images', 'success'); } else toast(result.error || 'Failed', 'error'); }); }
function batchAddToAlbum() { if (!state.selectedImages.size) { toast('No images selected', 'error'); return; } showAddToAlbumModal(Array.from(state.selectedImages)); }
function showRenamePerson(id, currentName) {
  showModal('<h3>Rename Person <button onclick="closeModal()">\u2715</button></h3><div class="modal-field"><label>Name</label><input id="person-name-input" value="' + esc(currentName) + '"></div><div class="modal-actions"><button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button><button class="modal-btn modal-btn-primary" onclick="renamePerson(' + id + ')">Save</button></div>');
  setTimeout(function() { var el = $('person-name-input'); if (el) el.focus(); }, 100);
}
function renamePerson(id) { var name = $('person-name-input') ? $('person-name-input').value.trim() : ''; if (!name) return; postApi('/api/rename-person', { id: id, name: name }).then(function(result) { if (result.success) { closeModal(); toast('Person renamed', 'success'); loadSidebar(); } else toast(result.error || 'Failed', 'error'); }); }

// ── Sidebar scroll perf: disable pointer-events during scroll (Chrome fix) ──
(function(){
  const nav=$('sidebar-nav');
  const inner=$('nav-inner');
  let scrolling=false;
  nav.addEventListener('scroll',()=>{
    if(!scrolling){scrolling=true;inner.style.pointerEvents='none';}
  },{passive:true});
  nav.addEventListener('scrollend',()=>{
    scrolling=false;inner.style.pointerEvents='';
  });
})();

// ── Image Editor ──
var editorState = { imageId: null, originalImage: null, ctx: null, history: [], historyIdx: -1, adjustments: { brightness:100, contrast:100, saturation:100, sharpen:0, rotation:0 }, activeFilter: null, bgRemoved: false };
var quickFilters = [
  { name:'Original', icon:'🔄', vals:{ brightness:100, contrast:100, saturation:100 } },
  { name:'Vivid', icon:'🌈', vals:{ brightness:105, contrast:120, saturation:150 } },
  { name:'Warm', icon:'🌅', vals:{ brightness:108, contrast:105, saturation:120 } },
  { name:'Cool', icon:'❄️', vals:{ brightness:100, contrast:110, saturation:80 } },
  { name:'B&W', icon:'⬛', vals:{ brightness:100, contrast:115, saturation:0 } },
  { name:'Vintage', icon:'📷', vals:{ brightness:95, contrast:90, saturation:70 } },
  { name:'Dramatic', icon:'🎭', vals:{ brightness:90, contrast:140, saturation:110 } },
  { name:'Fade', icon:'🌫️', vals:{ brightness:110, contrast:80, saturation:80 } },
  { name:'Bright', icon:'☀️', vals:{ brightness:130, contrast:105, saturation:110 } }
];

function openEditor(imageId) {
  var detail = state.rsbDetail;
  if (!detail) return;
  editorState.imageId = imageId;
  editorState.history = []; editorState.historyIdx = -1;
  editorState.adjustments = { brightness:100, contrast:100, saturation:100, sharpen:0, rotation:0 };
  editorState.activeFilter = null; editorState.bgRemoved = false;
  $('editor-filename').textContent = detail.name || '';
  // Reset sliders
  document.querySelectorAll('.editor-slider').forEach(function(s) {
    var def = s.max === '10' ? '0' : '100';
    s.value = def;
  });
  ['brightness','contrast','saturation'].forEach(function(k) { var el = $('val-' + k); if (el) el.textContent = '100'; });
  var vs = $('val-sharpen'); if (vs) vs.textContent = '0';
  // Render filters
  var fhtml = '';
  quickFilters.forEach(function(f) {
    fhtml += '<div class="editor-filter-chip" data-filter="' + f.name + '" onclick="editorApplyFilter(\\'' + f.name + '\\')">';
    fhtml += '<span class="filter-icon">' + f.icon + '</span><span class="filter-label">' + f.name + '</span></div>';
  });
  $('editor-filters').innerHTML = fhtml;
  // Load image
  var canvas = $('editor-canvas');
  editorState.ctx = canvas.getContext('2d');
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    editorState.ctx.drawImage(img, 0, 0);
    editorState.originalImage = img;
    editorCaptureState();
    $('editor-overlay').style.display = 'flex';
    // Check license
    var li = state.licenseInfo || {};
    var isPro = li.tier !== 'free';
    $('editor-bg-btn').disabled = !isPro;
    $('editor-bg-hint').style.display = isPro ? 'none' : '';
  };
  img.onerror = function() { toast('Could not load image for editing', 'error'); };
  img.src = '/api/media/' + imageId;
}

function closeEditor() { $('editor-overlay').style.display = 'none'; document.querySelector('.editor-canvas-area').classList.remove('checkerboard'); }

function isVideoLibraryItem(item) {
  return !!(item && item.isVideo);
}

function isVideoDetail(detail) {
  return !!(detail && /^(mp4|mov|m4v|mkv|avi|webm|wmv|flv|mpeg|mpg|3gp)$/i.test(String(detail.fileType || '')));
}

function getSelectedVideoStudioIds(fallbackId) {
  var ids = [];
  if (state.batchMode && state.selectedImages.size) {
    ids = Array.from(state.selectedImages).filter(function(id) {
      var item = state.images.find(function(img) { return img.id === id; });
      return isVideoLibraryItem(item);
    });
  }
  if (!ids.length && fallbackId) {
    var fallbackItem = state.images.find(function(img) { return img.id === fallbackId; });
    if (isVideoLibraryItem(fallbackItem) || isVideoDetail(state.rsbDetail)) ids = [fallbackId];
  }
  return ids;
}

function loadVideoStudioDuration(mediaUrl) {
  return new Promise(function(resolve, reject) {
    var video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = function() {
      var duration = Number(video.duration || 0);
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
    };
    video.onerror = function() { reject(new Error('Could not read video metadata.')); };
    video.src = mediaUrl;
  });
}

async function buildVideoStudioClip(imageId) {
  var item = state.images.find(function(img) { return img.id === imageId; }) || {};
  var duration = await loadVideoStudioDuration('/api/media/' + imageId);
  return {
    id: 'clip-' + (videoStudioState.clipSeq++),
    imageId: imageId,
    name: item.name || ('Video ' + imageId),
    duration: duration,
    startTime: 0,
    endTime: duration,
    fadeIn: 0,
    fadeOut: 0,
    transitionDuration: 0,
    transitionType: 'fade',
    audioTransitionCurve: 'tri',
    volume: 1,
    muted: false,
  };
}

function resetVideoStudioState() {
  videoStudioState.clips = [];
  videoStudioState.audioOverlays = [];
  videoStudioState.exportPreset = 'source';
  videoStudioState.previewUrl = '';
  videoStudioState.outputPath = '';
  videoStudioState.status = '';
  videoStudioState.busy = false;
  videoStudioState.clipSeq = 1;
  videoStudioState.overlaySeq = 1;
}

async function openVideoStudio(imageId) {
  var ids = getSelectedVideoStudioIds(imageId);
  if (!ids.length) {
    toast('Select at least one video to open Video Studio.', 'error');
    return;
  }
  window.location.href = '/video-editor?ids=' + encodeURIComponent(ids.join(','));
}

function editorCaptureState() {
  var c = $('editor-canvas');
  var data = editorState.ctx.getImageData(0, 0, c.width, c.height);
  editorState.history = editorState.history.slice(0, editorState.historyIdx + 1);
  editorState.history.push({ data: data, w: c.width, h: c.height, adj: Object.assign({}, editorState.adjustments) });
  if (editorState.history.length > 30) editorState.history.shift();
  editorState.historyIdx = editorState.history.length - 1;
  editorUpdateUndoRedo();
}
function editorUpdateUndoRedo() {
  $('editor-undo').disabled = editorState.historyIdx <= 0;
  $('editor-redo').disabled = editorState.historyIdx >= editorState.history.length - 1;
}
function editorUndo() {
  if (editorState.historyIdx <= 0) return;
  editorState.historyIdx--;
  var s = editorState.history[editorState.historyIdx];
  var c = $('editor-canvas'); c.width = s.w; c.height = s.h;
  editorState.ctx.putImageData(s.data, 0, 0);
  editorState.adjustments = Object.assign({}, s.adj);
  editorSyncSliders();
  editorUpdateUndoRedo();
}
function editorRedo() {
  if (editorState.historyIdx >= editorState.history.length - 1) return;
  editorState.historyIdx++;
  var s = editorState.history[editorState.historyIdx];
  var c = $('editor-canvas'); c.width = s.w; c.height = s.h;
  editorState.ctx.putImageData(s.data, 0, 0);
  editorState.adjustments = Object.assign({}, s.adj);
  editorSyncSliders();
  editorUpdateUndoRedo();
}
function editorSyncSliders() {
  var a = editorState.adjustments;
  var sliders = document.querySelectorAll('.editor-slider');
  var keys = ['brightness','contrast','saturation','sharpen'];
  sliders.forEach(function(s, i) { if (keys[i]) { s.value = a[keys[i]]; var el = $('val-' + keys[i]); if (el) el.textContent = a[keys[i]]; } });
}

function editorRotate(deg) {
  var c = $('editor-canvas'); var ctx = editorState.ctx;
  var imgData = ctx.getImageData(0, 0, c.width, c.height);
  var tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
  tmp.getContext('2d').putImageData(imgData, 0, 0);
  if (Math.abs(deg) === 90) { c.width = tmp.height; c.height = tmp.width; }
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(deg * Math.PI / 180);
  ctx.drawImage(tmp, -tmp.width / 2, -tmp.height / 2);
  ctx.restore();
  editorCaptureState();
}

function editorToggleCrop() {
  toast('Crop: Use the desktop app for precise cropping', 'info');
}

function editorAutoEnhance() {
  var c = $('editor-canvas'); var ctx = editorState.ctx;
  var data = ctx.getImageData(0, 0, c.width, c.height);
  var d = data.data;
  var minR=255,minG=255,minB=255,maxR=0,maxG=0,maxB=0;
  for (var i=0;i<d.length;i+=4) { minR=Math.min(minR,d[i]);maxR=Math.max(maxR,d[i]);minG=Math.min(minG,d[i+1]);maxG=Math.max(maxG,d[i+1]);minB=Math.min(minB,d[i+2]);maxB=Math.max(maxB,d[i+2]); }
  var rR=maxR-minR||1,rG=maxG-minG||1,rB=maxB-minB||1;
  for (var i=0;i<d.length;i+=4) { d[i]=(d[i]-minR)*255/rR;d[i+1]=(d[i+1]-minG)*255/rG;d[i+2]=(d[i+2]-minB)*255/rB; }
  ctx.putImageData(data,0,0);
  editorCaptureState();
  toast('Auto-enhanced', 'success');
}

function editorAdjust(key, val) {
  editorState.adjustments[key] = parseFloat(val);
  var el = $('val-' + key); if (el) el.textContent = val;
  editorApplyAdjustments();
}

function editorApplyAdjustments() {
  if (!editorState.originalImage) return;
  var c = $('editor-canvas'); var ctx = editorState.ctx;
  var a = editorState.adjustments;
  ctx.filter = 'brightness(' + (a.brightness/100) + ') contrast(' + (a.contrast/100) + ') saturate(' + (a.saturation/100) + ')';
  ctx.drawImage(editorState.originalImage, 0, 0, c.width, c.height);
  ctx.filter = 'none';
  if (a.sharpen > 0) {
    var data = ctx.getImageData(0, 0, c.width, c.height);
    editorSharpen(data, a.sharpen);
    ctx.putImageData(data, 0, 0);
  }
}

function editorSharpen(imageData, amount) {
  var d = imageData.data; var w = imageData.width; var h = imageData.height;
  var copy = new Uint8ClampedArray(d);
  var k = amount / 10;
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      var i = (y * w + x) * 4;
      for (var c = 0; c < 3; c++) {
        var center = copy[i + c] * 5;
        var neighbors = copy[((y-1)*w+x)*4+c] + copy[((y+1)*w+x)*4+c] + copy[(y*w+x-1)*4+c] + copy[(y*w+x+1)*4+c];
        d[i + c] = Math.min(255, Math.max(0, copy[i + c] + k * (center - neighbors - copy[i + c])));
      }
    }
  }
}

function editorApplyFilter(name) {
  editorState.activeFilter = name;
  document.querySelectorAll('.editor-filter-chip').forEach(function(c) { c.classList.toggle('active', c.dataset.filter === name); });
  var filter = quickFilters.find(function(f) { return f.name === name; });
  if (!filter) return;
  editorState.adjustments.brightness = filter.vals.brightness;
  editorState.adjustments.contrast = filter.vals.contrast;
  editorState.adjustments.saturation = filter.vals.saturation;
  editorSyncSliders();
  editorApplyAdjustments();
  editorCaptureState();
}

function editorRemoveBg() {
  if (!editorState.imageId) return;
  if (editorState.bgRemoved) { toast('Background already removed', 'info'); return; }
  var btn = $('editor-bg-btn');
  var loadingEl = $('editor-loading');
  var loadingText = $('editor-loading-text');
  btn.disabled = true;
  btn.textContent = 'Processing...';
  loadingEl.style.display = 'flex';
  loadingText.textContent = 'Removing background... This may take a minute.';
  fetch('/api/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ imageId: editorState.imageId })
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Failed'); });
    return r.blob();
  })
  .then(function(blob) {
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function() {
      var c = $('editor-canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      editorState.ctx.clearRect(0, 0, c.width, c.height);
      editorState.ctx.drawImage(img, 0, 0);
      editorState.originalImage = img;
      editorState.bgRemoved = true;
      editorCaptureState();
      URL.revokeObjectURL(url);
      btn.textContent = '✓ Background Removed';
      btn.disabled = true;
      loadingEl.style.display = 'none';
      document.querySelector('.editor-canvas-area').classList.add('checkerboard');
      toast('Background removed successfully', 'success');
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      btn.textContent = 'Remove Background';
      btn.disabled = false;
      loadingEl.style.display = 'none';
      toast('Failed to load processed image', 'error');
    };
    img.src = url;
  })
  .catch(function(err) {
    btn.textContent = 'Remove Background';
    btn.disabled = false;
    loadingEl.style.display = 'none';
    toast(err.message || 'Background removal failed', 'error');
  });
}

function editorReset() {
  editorState.adjustments = { brightness:100, contrast:100, saturation:100, sharpen:0, rotation:0 };
  editorState.activeFilter = null;
  editorState.bgRemoved = false;
  document.querySelector('.editor-canvas-area').classList.remove('checkerboard');
  var bgBtn = $('editor-bg-btn'); if (bgBtn) { bgBtn.textContent = 'Remove Background'; bgBtn.disabled = false; }
  editorSyncSliders();
  document.querySelectorAll('.editor-filter-chip').forEach(function(c) { c.classList.remove('active'); });
  if (editorState.originalImage) {
    var c = $('editor-canvas'); var ctx = editorState.ctx;
    c.width = editorState.originalImage.naturalWidth; c.height = editorState.originalImage.naturalHeight;
    ctx.drawImage(editorState.originalImage, 0, 0);
  }
  editorCaptureState();
  toast('Reset to original', 'success');
}

function editorSave() {
  var c = $('editor-canvas');
  var usePng = editorState.bgRemoved;
  var mimeType = usePng ? 'image/png' : 'image/jpeg';
  var quality = usePng ? undefined : 0.95;
  c.toBlob(function(blob) {
    if (!blob) { toast('Failed to export canvas', 'error'); return; }
    var original = state.rsbDetail ? state.rsbDetail.name : 'edited';
    var base = original.replace(/\.[^.]+$/, '');
    var saveExt = usePng ? 'png' : original.replace(/.*\./, '');
    var filename = base + '_edited.' + saveExt;
    var form = new FormData();
    form.append('file', blob, filename);
    fetch('/api/upload-edited', { method:'POST', body: form, credentials:'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) { toast('Saved as ' + filename, 'success'); closeEditor(); resetAndLoad(); }
        else toast(data.error || 'Failed to save', 'error');
      })
      .catch(function() { toast('Failed to save edited image', 'error'); });
  }, mimeType, quality);
}

loadSlideshowSettings();
loadSidebar();
loadLicenseInfo();
selectUnsorted();

// Deselect when clicking gallery background
$('gallery').addEventListener('click', function(e) {
  if (e.target === $('grid') || e.target === $('gallery')) {
    document.querySelectorAll('.card.selected').forEach(function(c) { c.classList.remove('selected'); });
    state.rsbDetail = null; state.rsbSelectedId = null;
    renderRightSidebar();
  }
});
</script>
</body>
</html>`;
}

export function getLoginHtml(locked = false) {
  const lockoutMsg = locked ? '<div class="lockout-msg">⚠️ Too many failed attempts. Please wait 15 minutes before trying again.</div>' : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>Login — Pluto Photos</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#0a0a0a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.login-card{background:#111;border:1px solid #1a1a1a;border-radius:16px;padding:40px 36px;width:100%;max-width:380px;box-shadow:0 8px 40px rgba(0,0,0,.6)}
.login-card .logo{text-align:center;margin-bottom:8px}
.login-card h1{text-align:center;font-size:18px;font-weight:700;color:#fff;margin-bottom:4px}
.login-card .subtitle{text-align:center;font-size:13px;color:#666;margin-bottom:28px}
.field{margin-bottom:16px}
.field label{display:block;font-size:11px;font-weight:600;color:#777;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
.field input{width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px;color:#ddd;font-size:14px;outline:none;transition:border-color .2s}
.field input:focus{border-color:#58a6ff}
.login-btn{width:100%;background:#58a6ff;color:#000;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;transition:background .2s}
.login-btn:hover{background:#79b8ff}
.login-btn:disabled{opacity:.5;cursor:not-allowed}
.error-msg{color:#f85149;font-size:12px;text-align:center;margin-top:12px;min-height:18px}
.lockout-msg{background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);color:#f85149;padding:12px;border-radius:8px;font-size:12px;text-align:center;margin-bottom:16px}
</style>
</head>
<body>
<div class="login-card">
  <div class="logo"><img src="/api/logo" alt="Pluto" style="width:48px;height:48px;border-radius:8px"></div>
  <h1>Pluto Photos</h1>
  <div class="subtitle">Sign in to view your photos</div>
  ${lockoutMsg}
  <form id="login-form" onsubmit="handleLogin(event)">
    <div class="field">
      <label>Username</label>
      <input type="text" id="username" autocomplete="username" required autofocus>
    </div>
    <div class="field">
      <label>Password</label>
      <input type="password" id="password" autocomplete="current-password" required>
    </div>
    <button type="submit" class="login-btn" id="login-btn">Sign In</button>
    <div class="error-msg" id="error-msg"></div>
  </form>
</div>
<script>
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('error-msg');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  
  btn.disabled = true;
  errEl.textContent = '';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      window.location.href = '/';
    } else {
      errEl.textContent = data.error || 'Login failed';
    }
  } catch (err) {
    errEl.textContent = 'Connection error';
  }
  btn.disabled = false;
}
</script>
</body>
</html>`;
}
