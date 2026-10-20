export const styles = `
.pb{--pb-accent:#346f5b;--pb-ink:#20332d;--pb-muted:#68766f;--pb-tint:rgba(52,111,91,.065);--pb-hover:rgba(52,111,91,.13);--pb-edge:rgba(52,111,91,.17);color:var(--pb-ink);font:12px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;box-sizing:border-box}
.pb *{box-sizing:border-box}.pb button{font:inherit;cursor:pointer}.pb button:disabled{cursor:default;opacity:.3}.pb button:focus-visible{outline:2px solid var(--pb-accent);outline-offset:2px}
.pb-inline{display:inline-flex;align-items:center;gap:4px;vertical-align:middle;min-width:0}
.pb-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;color:inherit;opacity:.55;flex:none}
.pb-icon svg{width:17px;height:17px;display:block}
.pb-icon:not(:disabled):hover{opacity:1;color:var(--pb-accent)}
.pb-main{width:30px;height:30px;border-radius:9px;border:1px solid var(--pb-edge);background:var(--pb-tint);color:var(--pb-accent);opacity:1;transition:background .15s ease,border-color .15s ease,transform .15s ease,box-shadow .15s ease}
.pb-main svg{width:20px;height:20px;overflow:visible}
.pb-main:not(:disabled):hover{background:var(--pb-hover);border-color:var(--pb-accent);box-shadow:0 2px 6px rgba(0,0,0,.08);transform:translateY(-1px)}
.pb-main:not(:disabled):active{transform:translateY(0);box-shadow:none;background:var(--pb-hover)}
.pb .pb-main:disabled{opacity:.42;background:transparent;border-color:transparent;color:var(--pb-muted)}
.pb-main.pb-working{background:var(--pb-hover);border-color:var(--pb-edge)}
.pb-progress-track{opacity:.18}
@keyframes pb-spin{to{transform:rotate(360deg)}}
.pb-progress{transform-origin:12px 12px;animation:pb-spin 1s linear infinite}
.pb-note{color:var(--pb-muted);font-size:12px}
.pb-status{display:inline-block;max-width:min(180px,35vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* DSH's theme presenter writes data-ds-dark-theme on <body> only while the resolved scheme is dark (data-ds-theme-source on <html> records the source). */
[data-ds-dark-theme] .pb{--pb-accent:#a5d5bf;--pb-ink:#e1ebe4;--pb-muted:#9baa9f;--pb-tint:rgba(142,200,173,.075);--pb-hover:rgba(142,200,173,.15);--pb-edge:rgba(142,200,173,.2)}
/* Older hosts/plain pages publish neither attribute; only then follow the OS. The guards keep an explicit DSH light theme light when the OS is dark. */
@media(prefers-color-scheme:dark){:root:not([data-ds-theme-source]):not([data-ds-dark-theme]) body:not([data-ds-theme-source]):not([data-ds-dark-theme]) .pb{--pb-accent:#a5d5bf;--pb-ink:#e1ebe4;--pb-muted:#9baa9f;--pb-tint:rgba(142,200,173,.075);--pb-hover:rgba(142,200,173,.15);--pb-edge:rgba(142,200,173,.2)}}
@media(prefers-reduced-motion:reduce){.pb-progress{animation:none}.pb-main{transition:none}.pb-main:not(:disabled):hover{transform:none}}
@media(forced-colors:active){.pb-main{color:ButtonText;border-color:ButtonText}.pb-main:focus-visible{outline-color:Highlight}.pb-icon:not(.pb-main){border:1px solid ButtonText;color:ButtonText}.pb-icon:not(.pb-main):focus-visible{outline-color:Highlight}}
`
