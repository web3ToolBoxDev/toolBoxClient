(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
!function(){function e(e){return e&&e.__esModule?e.default:e}var t=("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{}).parcelRequire1d24;t.register("iI3S3",(function(n,l){var a,i,o,r,s;a=n.exports,Object.defineProperty(a,"__esModule",{value:!0,configurable:!0}),i=n.exports,o="default",r=function(){return y},Object.defineProperty(i,o,{get:r,set:s,enumerable:!0,configurable:!0});var f=t("43063"),c=t("29o0l"),u=t("gkfw3"),d=t("j81qC"),p=t("27SDj"),g=t("gX5Te"),b=t("feAoQ");const m=u.default.div`
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
`,h=(0,u.default)(p.Text)`
  color: #777;
  font-size: 14px;
  font-weight: 500;
  margin-left: 4px;
`,w=u.default.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
`,x=e(c).memo((({ariaLabel:t,slippageTolerance:n,showSettings:l})=>e(c).createElement(m,{"data-testid":"slippage-settings-menu-open-button",onClick:l,role:"button","aria-label":t},e(c).createElement(w,null,e(c).createElement(d.IconTokenListSettings,{className:"settingsMenuIcon",width:16,stroke:"#777"}),n?e(c).createElement(h,null,`${n}%`):null))));var y=()=>{const{t:t}=(0,f.useTranslation)(),{handleShowModalVisibility:n}=(0,b.useModals)(),l=(0,c.useCallback)((()=>{n("slippageSettings")}),[n]),{data:a}=g.hooks.useSlippageTolerance();return e(c).createElement(x,{ariaLabel:t("commandOpen"),slippageTolerance:a,showSettings:l})}}))}();
//# sourceMappingURL=SwapSettingsButton.6a1f394d.js.map
define=__define;})(window.define);