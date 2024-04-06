(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
function e(e){return e&&e.__esModule?e.default:e}function t(e,t,n,l){Object.defineProperty(e,t,{get:n,set:l,enumerable:!0,configurable:!0})}var n=("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{}).parcelRequire1d24;n.register("8FuDc",(function(l,a){var o;o=l.exports,Object.defineProperty(o,"__esModule",{value:!0,configurable:!0}),t(l.exports,"default",(function(){return x}));var i=n("lBuGR"),r=n("a0t1u"),s=n("lDSNw"),u=n("lz7nT"),d=n("44I6u"),c=n("5RSKW"),p=n("hjnIF"),m=n("3wXUE"),g=n("72nwa"),b=n("dRMhw"),h=n("iZRoy"),f=n("gMNJN");const w=()=>{const{multichainQuoteResponse:t,hasNoRoutes:n}=(0,r.useMultichainQuote)();return e(s).createElement(h.SwapWrapper,null,e(s).createElement(d.Column,{justify:"space-between",flex:1},e(s).createElement(d.Column,{align:"normal"},e(s).createElement(m.SwapSellAssetCard,null),e(s).createElement(m.SwapBuyAssetCard,null),t||n?e(s).createElement(g.SwapInfoCard,null):null),e(s).createElement(d.Column,null,t?e(s).createElement(b.SwapReviewButton,null):null)))};var x=()=>{const{isLoadingInitialAssets:t}=(()=>{var e,t,n;const[l]=(0,u.useSearchParams)(),a=null!==(e=l.get("sellFungible"))&&void 0!==e?e:void 0,o=null!==(t=l.get("sellAmount"))&&void 0!==t?t:void 0,d=null!==(n=l.get("buyFungible"))&&void 0!==n?n:void 0,{data:[c]}=(0,i.useFeatureFlags)(["enable-native-bridge-pairs"]),p=(0,r.useSwapperStore)((e=>e.resetSwapper));f.hooks.useSubscribeSwapQuoteToQueries({skipInitialBuyFungible:!0}),f.hooks.useSubscribeGasEstimation();const{isLoading:m}=f.hooks.useInitialAssets({paramsSellFungible:a,paramsSellAmount:o,paramsBuyFungible:d,enableNativeBridgePairs:c});return(0,s.useLayoutEffect)((()=>p),[p]),{isLoadingInitialAssets:m}})();return t?e(s).createElement(e(s).Fragment,null,e(s).createElement(p.SkeletonLoader,{height:"120px",borderRadius:"8px 8px 0 0"}),e(s).createElement(c.ItemSeparator,{gap:1}),e(s).createElement(p.SkeletonLoader,{height:"120px",borderRadius:"0 0 8px 8px"})):e(s).createElement(w,null)}})),n.register("3wXUE",(function(l,a){t(l.exports,"SwapSellAssetCard",(function(){return f})),t(l.exports,"SwapBuyAssetCard",(function(){return E}));var o=n("lBuGR"),i=n("lMzyG"),r=n("lDSNw"),s=n("cZIbv"),u=n("miiws"),d=n("6EObQ"),c=n("aanFI"),p=n("kn91D"),m=n("gMNJN"),g=n("2LZGp"),b=n("hveHb");const h=e(r).memo((({onClick:t})=>e(r).createElement(C,null,e(r).createElement(I,{onClick:t},e(r).createElement(c.IconArrowDownSquare,{fill:"#000000"}))))),f=()=>{const t=(()=>{const{data:[e]}=(0,o.useFeatureFlags)(["enable-native-bridge-pairs"]),t=m.hooks.useSwapSellAssetProps({enableNativeBridgePairs:e,isBalanceHidden:!1}),{handleShowModalVisibility:n}=(0,g.useModals)(),l=(0,r.useCallback)((()=>{n("swapSellAssetSelect")}),[n]);return Object.assign(Object.assign({},t),{onSellAssetClicked:l})})();return e(r).createElement(w,Object.assign({},t))},w=e(r).memo((({assetButtonTitle:t,assetSubheadline:n,decimals:l,formattedMaxSellAmount:a,sellFungible:o,notEnoughAssets:i,hasMinimumSellAmount:s,uiSellAmount:u,onSellAssetClicked:p,setMaxSellAmount:m,updateSellAmount:g})=>{const{chain:h,logoUri:f,symbol:w,tokenAddress:x}=o.data;return e(r).createElement(v,{roundedTop:!0},e(r).createElement(B,{onClick:p},e(r).createElement(d.EcosystemImage,{image:{type:"fungible",src:f,fallback:w||x},size:44,tokenType:o.type,chainMeta:h}),e(r).createElement(F,null,e(r).createElement(y,null,o.data.name),e(r).createElement(A,null,n)),e(r).createElement(c.IconChevronDownThin,{fill:"#999999"})),e(r).createElement(M,null,e(r).createElement(b.SwapperInput,{dropdownTestID:"swap-sell-asset-dropdown",assetButtonTitle:t,decimals:l,disabled:!1,hasWarning:i||!s,isLoadingAmount:!1,isLoadingAssets:!1,onClick:p,onUserInput:g,value:u,maxSellAmount:a,setMaxSellAmount:m,fontSize:28})))})),x=e(r).memo((({t:t,assetButtonTitle:n,assetSubheadline:l,buyAmount:a,currencyValue:o,decimals:i,symbol:s,logoUri:u,tokenAddress:p,tokenType:m,network:g,isFetchingQuote:f,onBuyAssetClicked:w,onSwitchTokens:x})=>g&&m?e(r).createElement(e(r).Fragment,null,e(r).createElement(h,{onClick:x}),e(r).createElement(v,{roundedBottom:!0},e(r).createElement(B,{onClick:w},e(r).createElement(d.EcosystemImage,{image:{type:"fungible",src:u,fallback:s||p},size:44,tokenType:m,chainMeta:g}),e(r).createElement(F,null,e(r).createElement(y,null,n),e(r).createElement(A,null,l)),e(r).createElement(c.IconChevronDownThin,{fill:"#999999"})),e(r).createElement(M,null,e(r).createElement(b.SwapperInput,{dropdownTestID:"swap-buy-asset-dropdown",assetButtonTitle:n,decimals:i,disabled:!0,hasWarning:!1,isLoadingAmount:f,isLoadingAssets:!1,onClick:w,onUserInput:()=>{},value:a,currencyValue:o,fontSize:28})))):e(r).createElement(S,{t:t,onClick:w}))),E=()=>{const t=(()=>{const{t:e}=(0,i.useTranslation)(),{handleShowModalVisibility:t}=(0,g.useModals)(),n=(0,r.useCallback)((()=>{t("swapBuyAssetSelect")}),[t]),{isSingleChainEnabled:l}=m.hooks.useEnabledChainsInfo(),a=m.hooks.useSwapBuyAssetProps({isSingleChainEnabled:l});return Object.assign(Object.assign({},a),{onBuyAssetClicked:n,t:e})})();return e(r).createElement(x,Object.assign({},t))},S=({t:t,onClick:n})=>e(r).createElement(e(r).Fragment,null,e(r).createElement(h,null),e(r).createElement(k,{onClick:n},e(r).createElement(B,null,e(r).createElement(T,null,e(r).createElement(c.IconPlusThin,{width:20})),e(r).createElement(F,null,e(r).createElement(A,{size:16,weight:600},t("swapSelectToken")))))),v=s.default.div`
  background: #2a2a2a;
  border-top-right-radius: ${e=>e.roundedTop?8:0}px;
  border-top-left-radius: ${e=>e.roundedTop?8:0}px;
  border-bottom-right-radius: ${e=>e.roundedBottom?8:0}px;
  border-bottom-left-radius: ${e=>e.roundedBottom?8:0}px;
  padding: 8px;
`,k=(0,s.default)(v).attrs({roundedBottom:!0})`
  cursor: pointer;
`,y=(0,s.default)(p.Text).attrs({size:16,color:"#FFF",weight:600,lineHeight:19,textAlign:"left"})``,A=(0,s.default)(p.Text).attrs((e=>({size:e.size||14,color:"#777",weight:e.weight||400,lineHeight:17,textAlign:"left"})))``,C=s.default.div`
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  height: 1px;
`,I=(0,s.default)(u.Circle).attrs({color:"#AB9FF2",diameter:32})`
  z-index: 0;
  cursor: pointer;
  &:hover {
    background: #e2dffe;
  }
  margin-top: -16px;
  margin-bottom: -16px;
`,T=(0,s.default)(u.Circle).attrs({color:"#181818",diameter:44})``,B=s.default.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  cursor: pointer;
  &:hover {
    background: #333333;
  }
  padding: 8px;
  border-radius: 8px;
`,F=s.default.div`
  display: flex;
  flex-direction: column;
  margin-left: 10px;
  width: 100%;
`,M=s.default.div`
  padding: 0 0 8px 8px;
`})),n.register("hveHb",(function(l,a){t(l.exports,"SwapperInput",(function(){return m}));var o=n("lMzyG"),i=n("lDSNw"),r=n("cZIbv"),s=n("jLA72"),u=n("hjnIF"),d=n("kn91D");const c=r.default.div`
  display: flex;
  align-items: center;
  height: 36px;
  input {
    font-size: ${e=>{var t;return null!==(t=e.fontSize)&&void 0!==t?t:34}}px;
    line-height: 1;
    font-weight: 600;
    padding: 0;
    background: none;
  }
`,p=r.default.div`
  width: 100%;
  margin-top: 11px;
  margin-bottom: 10px;
`,m=({decimals:t,disabled:n,hasWarning:l,isLoadingAmount:a,value:r,name:m="amount","aria-labelledby":b,"aria-label":h,onUserInput:f,maxSellAmount:w,setMaxSellAmount:x,currencyValue:E,fontSize:S})=>{const{t:v}=(0,o.useTranslation)();return e(i).createElement(c,{hasWarning:l,fontSize:S},a?e(i).createElement(p,null,e(i).createElement(u.SkeletonLoader,{width:"100px",height:"20px",backgroundColor:"#434343",borderRadius:"10px"})):e(i).createElement(s.NumericalInput,{"aria-labelledby":b,"aria-label":h,name:m,border:"0",placeholder:"0",warning:l,value:r,decimalLimit:t,disabled:n,onUserInput:f}),w&&void 0!==x&&e(i).createElement(g,{onClick:x},v("maxInputMax")),a?e(i).createElement(u.SkeletonLoader,{width:"50px",height:"12px",backgroundColor:"#434343",borderRadius:"10px"}):E?e(i).createElement(d.Text,{size:16,color:"#777"},E):void 0)},g=r.default.div`
  color: #ab9ff2;
  font-size: 14px;
  font-weight: 400;
  white-space: nowrap;
  cursor: pointer;
  margin-left: 5px;
  border-radius: 8px;
  padding: 8px;
  &:hover {
    background-color: #333333;
  }
`})),n.register("dRMhw",(function(l,a){t(l.exports,"SwapReviewButton",(function(){return g}));var o=n("lMzyG"),i=n("a0t1u"),r=n("lDSNw"),s=n("laYjG"),u=n("gMNJN"),d=n("2LZGp");const c=()=>{const{t:t}=(0,o.useTranslation)();return e(r).createElement(s.Button,{type:"submit",theme:"default",disabled:!0},t("swapFlowActionButtonText"))},p=()=>{const{disabled:t,theme:n,title:l,onClick:a}=m();return e(r).createElement(s.Button,{type:"submit",theme:n,disabled:t,onClick:a},l)},m=()=>{const{t:e}=(0,o.useTranslation)(),{hasEnoughAssets:t,hasNoRoutes:n,canSwap:l,hasNoFundsForFees:a,sourceNativeToken:s}=u.hooks.useSwapReviewButtonProps(),c=(0,i.useSwapperStore)((e=>e.setQuoteFetchIntervalToggle)),{handleShowModalVisibility:p}=(0,d.useModals)(),m=(0,r.useCallback)((()=>{a?p("insufficientBalance",{networkId:s.networkId,token:{balance:s.balance,required:s.required}}):(c(!1),p("swapReview"))}),[a,p,s.networkId,s.balance,s.required,c]);return l?{disabled:!1,theme:"primary",title:e("swapFlowActionButtonText"),onClick:m}:t?n?{disabled:!0,theme:"default",title:e("swapNoQuotesFound"),onClick:m}:{disabled:!0,theme:"default",title:e("swapFlowActionButtonText"),onClick:m}:{disabled:!0,theme:"warning",title:e("sendFormErrorInsufficientBalance"),onClick:m}},g=()=>{const{multichainQuoteResponse:t}=(0,i.useMultichainQuote)();return t?e(r).createElement(p,null):e(r).createElement(c,null)}})),n.register("iZRoy",(function(l,a){t(l.exports,"SwapWrapper",(function(){return p}));var o=n("belzv"),i=n("lMzyG"),r=n("lDSNw"),s=n("cZIbv"),u=n("gMNJN"),d=n("9mefy");const c=s.default.div`
  display: flex;
  flex: 1;
  padding-bottom: 16px;
  margin-bottom: -16px; // fix extension padding issue when scrollable or not
`,p=e(r).memo((({children:t})=>{const n=u.hooks.useSelectedNetworks().every((e=>o.Chains.isMainnetNetworkID(e))),{t:l}=(0,i.useTranslation)(),a=(0,r.useMemo)((()=>({availableOnlyOnMainnet:l("swapAvailableOnMainnet")})),[l]);return n?e(r).createElement(c,null,t):e(r).createElement(d.SwapNotAvailableWrapper,{message:a.availableOnlyOnMainnet,swapDisabled:!0},t)}))})),n.register("9mefy",(function(l,a){t(l.exports,"SwapNotAvailableWrapper",(function(){return g}));var o=n("4y59b"),i=n("lDSNw"),r=n("cZIbv"),s=n("kn91D");const u=r.default.div`
  overflow-y: "scroll";
  padding-top: 16px;
`,d=r.default.fieldset.attrs({disabled:!0})`
  pointer-events: none;
  user-select: none;
`,c=r.default.div`
  position: absolute;
  z-index: 1;
  top: 0;
  height: 100vh;
  width: 100%;
  background-color: ${(0,o.hexToRGB)("#222222",.75)};
`,p=r.default.div`
  background-color: ${(0,o.hexToRGB)("#E5A221",.7)};
  padding: 12px 15px;
  position: absolute;
  /* TODO: change 15px to 16px and create a screen padding constant like on mobile */
  top: -15px;
  left: -15px;
  right: 15px;
  width: calc(100% + 2 * 15px);
`,m=(0,r.default)(s.Text).attrs({size:14,lineHeight:19,weight:500,color:"#fff",textAlign:"left"})``,g=({message:t,swapDisabled:n=!0,children:l})=>n?e(i).createElement(e(i).Fragment,null,e(i).createElement(c,{"data-testid":"disable-overlay"},e(i).createElement(p,null,e(i).createElement(m,null,t))),e(i).createElement(d,{"data-testid":"disable-wrapper"},l)):e(i).createElement(u,null,e(i).createElement(p,null,e(i).createElement(m,null,t)),e(i).createElement(e(i).Fragment,null,l))}));
//# sourceMappingURL=SwapTabPage.71ae0f47.js.map
define=__define;})(window.define);