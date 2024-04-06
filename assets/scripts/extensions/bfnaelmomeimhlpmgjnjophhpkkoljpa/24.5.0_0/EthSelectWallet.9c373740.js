(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
function e(e){return e&&e.__esModule?e.default:e}function t(e,t,l,n){Object.defineProperty(e,t,{get:l,set:n,enumerable:!0,configurable:!0})}var l=("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{}).parcelRequire1d24;l.register("6VDxw",(function(n,a){var r;r=n.exports,Object.defineProperty(r,"__esModule",{value:!0,configurable:!0}),t(n.exports,"EthSelectWallet",(function(){return k})),t(n.exports,"default",(function(){return M}));var i=l("lMzyG"),o=l("4chX7"),s=l("lDSNw"),c=l("cZIbv"),u=l("laYjG"),d=l("7E6dj"),p=l("kpxNY"),m=l("aanFI"),f=l("kn91D"),x=l("cJ96h"),h=l("j5DyG");const g=c.default.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`,E=c.default.div`
  display: flex;
  flex-direction: row;
  align-items: center;
`,y=c.default.div`
  background: #2a2a2a;
  border-radius: 6px;
  padding: 12px 16px;
`,_=c.default.div`
  display: flex;
  flex-direction: row;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  width: fit-content;
  margin-bottom: 8px;

  > span {
    min-height: 14px !important;
    height: 14px !important;
    min-width: 14px !important;
    width: 14px !important;
    border-radius: 3px !important;
  }
`,w=c.default.div`
  display: flex;
  gap: 16px;
`,b=c.default.div`
  padding: 27px 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
`,k=e(s).memo((({requestId:t})=>{const{t:l}=(0,i.useTranslation)(),n=(0,x.usePostOutgoingBackgroundResponse)(),[a,r]=(0,s.useState)(!1);let c;null!==t&&(c=t);const k=(0,s.useCallback)((()=>{n({jsonrpc:"2.0",id:c,result:a?o.user.user_selectEthWallet.result.enum.ALWAYS_USE_PHANTOM:o.user.user_selectEthWallet.result.enum.CONTINUE_WITH_PHANTOM})}),[c,n,a]),M=(0,s.useCallback)((()=>{n({jsonrpc:"2.0",id:c,result:a?o.user.user_selectEthWallet.result.enum.ALWAYS_USE_METAMASK:o.user.user_selectEthWallet.result.enum.CONTINUE_WITH_METAMASK})}),[c,n,a]);return e(s).createElement(h.Container,null,e(s).createElement(h.Body,{style:{display:"flex",alignItems:"center"}},e(s).createElement(b,null,e(s).createElement(p.IconHeader,{icon:e(s).createElement(w,null,e(s).createElement(m.IconPhantomLogo,{width:64}),e(s).createElement(m.IconMetaMask,{width:64,height:64})),primaryText:l("whichExtensionToConnectWith"),headerStyle:p.IconHeaderStyle.Small}))),e(s).createElement(h.Footer,{plain:!0,style:{padding:"0px 16px 16px"}},e(s).createElement(g,null,e(s).createElement(E,null,e(s).createElement(u.Button,{onClick:M,"data-testid":"select_wallet--metamask"},l("useMetaMask"))),e(s).createElement(E,null,e(s).createElement(u.Button,{theme:"primary",onClick:k,"data-testid":"select_wallet--phantom"},l("usePhantom"))),e(s).createElement(y,{"data-testid":"select_wallet--dont_ask_me_again",onClick:()=>r(!a)},e(s).createElement(_,null,e(s).createElement(d.Checkbox,{checked:a})," ",l("dontAskMeAgain")),e(s).createElement(f.Text,{color:"#777777",size:13,weight:500,lineHeight:16,textAlign:"left"},l("configureInSettings"))))))}));var M=k}));
//# sourceMappingURL=EthSelectWallet.9c373740.js.map
define=__define;})(window.define);