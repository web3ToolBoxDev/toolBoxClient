(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
function e(e){return e&&e.__esModule?e.default:e}var t=("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{}).parcelRequire1d24;t.register("4jJyn",(function(n,l){var a,i,o,r,s;a=n.exports,Object.defineProperty(a,"__esModule",{value:!0,configurable:!0}),i=n.exports,o="default",r=function(){return w},Object.defineProperty(i,o,{get:r,set:s,enumerable:!0,configurable:!0});var f=t("lMzyG"),c=t("lDSNw"),u=t("cZIbv"),d=t("aanFI"),p=t("kn91D"),g=t("gMNJN"),b=t("2LZGp");const m=u.default.div`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  gap: 4px;
  right: 8px;
  cursor: pointer;
  &:hover {
    svg {
      fill: #ab9ff2;
      path {
        stroke: #ab9ff2;
      }
      circle {
        stroke: #ab9ff2;
      }
    }
    p {
      color: #ab9ff2;
    }
  }
`,y=(0,u.default)(p.Text)`
  color: #777;
  font-size: 14px;
  font-weight: 500;
  margin-left: 4px;
`,h=u.default.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
`,v=e(c).memo((({ariaLabel:t,slippageTolerance:n,showSettings:l})=>e(c).createElement(m,{"data-testid":"slippage-settings-menu-open-button",onClick:l,role:"button","aria-label":t},e(c).createElement(h,null,e(c).createElement(d.IconTokenListSettings,{className:"settingsMenuIcon",width:16,stroke:"#777"}),n?e(c).createElement(y,null,`${n}%`):null))));var w=()=>{const{t:t}=(0,f.useTranslation)(),{handleShowModalVisibility:n}=(0,b.useModals)(),l=(0,c.useCallback)((()=>{n("slippageSettings")}),[n]),{data:a}=g.hooks.useSlippageTolerance();return e(c).createElement(v,{ariaLabel:t("commandOpen"),slippageTolerance:a,showSettings:l})}}));
//# sourceMappingURL=SwapSettingsButton.dcca0fcd.js.map
define=__define;})(window.define);