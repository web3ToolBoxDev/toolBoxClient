(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
!function(){function e(e){return e&&e.__esModule?e.default:e}function t(e,t,n,l){Object.defineProperty(e,t,{get:n,set:l,enumerable:!0,configurable:!0})}var n=("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{}).parcelRequire1d24;n.register("1fvbV",(function(l,a){var o;o=l.exports,Object.defineProperty(o,"__esModule",{value:!0,configurable:!0}),t(l.exports,"default",(function(){return x}));var r=n("3ljHn"),i=n("kram9"),s=n("29o0l"),u=n("iQL9s"),d=n("aWXnn"),c=n("75q0e"),p=n("hiI91"),m=n("fxDW6"),g=n("daIFc"),f=n("aQ8sL"),b=n("gPUr2"),h=n("gX5Te");const w=()=>{const{multichainQuoteResponse:t,hasNoRoutes:n}=(0,i.useMultichainQuote)();return e(s).createElement(b.SwapWrapper,null,e(s).createElement(d.Column,{justify:"space-between",flex:1},e(s).createElement(d.Column,{align:"normal"},e(s).createElement(m.SwapSellAssetCard,null),e(s).createElement(m.SwapBuyAssetCard,null),t||n?e(s).createElement(g.SwapInfoCard,null):null),e(s).createElement(d.Column,null,t?e(s).createElement(f.SwapReviewButton,null):null)))};var x=()=>{const{isLoadingInitialAssets:t}=(()=>{var e,t,n;const[l]=(0,u.useSearchParams)(),a=null!==(e=l.get("sellFungible"))&&void 0!==e?e:void 0,o=null!==(t=l.get("sellAmount"))&&void 0!==t?t:void 0,d=null!==(n=l.get("buyFungible"))&&void 0!==n?n:void 0,{data:[c]}=(0,r.useFeatureFlags)(["enable-native-bridge-pairs"]),p=(0,i.useSwapperStore)((e=>e.resetSwapper));h.hooks.useSubscribeSwapQuoteToQueries({skipInitialBuyFungible:!0}),h.hooks.useSubscribeGasEstimation();const{isLoading:m}=h.hooks.useInitialAssets({paramsSellFungible:a,paramsSellAmount:o,paramsBuyFungible:d,enableNativeBridgePairs:c});return(0,s.useLayoutEffect)((()=>p),[p]),{isLoadingInitialAssets:m}})();return t?e(s).createElement(e(s).Fragment,null,e(s).createElement(p.SkeletonLoader,{height:"120px",borderRadius:"8px 8px 0 0"}),e(s).createElement(c.ItemSeparator,{gap:1}),e(s).createElement(p.SkeletonLoader,{height:"120px",borderRadius:"0 0 8px 8px"})):e(s).createElement(w,null)}})),n.register("fxDW6",(function(l,a){t(l.exports,"SwapSellAssetCard",(function(){return h})),t(l.exports,"SwapBuyAssetCard",(function(){return E}));var o=n("3ljHn"),r=n("43063"),i=n("29o0l"),s=n("gkfw3"),u=n("6UMd8"),d=n("qppYH"),c=n("j81qC"),p=n("27SDj"),m=n("gX5Te"),g=n("feAoQ"),f=n("aC1K2");const b=e(i).memo((({onClick:t})=>e(i).createElement(C,null,e(i).createElement(T,{onClick:t},e(i).createElement(c.IconArrowDownSquare,{fill:"#000000"}))))),h=()=>{const t=(()=>{const{data:[e]}=(0,o.useFeatureFlags)(["enable-native-bridge-pairs"]),t=m.hooks.useSwapSellAssetProps({enableNativeBridgePairs:e,isBalanceHidden:!1}),{handleShowModalVisibility:n}=(0,g.useModals)(),l=(0,i.useCallback)((()=>{n("swapSellAssetSelect")}),[n]);return Object.assign(Object.assign({},t),{onSellAssetClicked:l})})();return e(i).createElement(w,Object.assign({},t))},w=e(i).memo((({assetButtonTitle:t,assetSubheadline:n,decimals:l,formattedMaxSellAmount:a,sellFungible:o,notEnoughAssets:r,hasMinimumSellAmount:s,uiSellAmount:u,onSellAssetClicked:p,setMaxSellAmount:m,updateSellAmount:g})=>{const{chain:b,logoUri:h,symbol:w,tokenAddress:x}=o.data;return e(i).createElement(S,{roundedTop:!0},e(i).createElement(B,{onClick:p},e(i).createElement(d.EcosystemImage,{image:{type:"fungible",src:h,fallback:w||x},size:44,tokenType:o.type,chainMeta:b}),e(i).createElement(F,null,e(i).createElement(y,null,o.data.name),e(i).createElement(A,null,n)),e(i).createElement(c.IconChevronDownThin,{fill:"#999999"})),e(i).createElement(M,null,e(i).createElement(f.SwapperInput,{dropdownTestID:"swap-sell-asset-dropdown",assetButtonTitle:t,decimals:l,disabled:!1,hasWarning:r||!s,isLoadingAmount:!1,isLoadingAssets:!1,onClick:p,onUserInput:g,value:u,maxSellAmount:a,setMaxSellAmount:m,fontSize:28})))})),x=e(i).memo((({t:t,assetButtonTitle:n,assetSubheadline:l,buyAmount:a,currencyValue:o,decimals:r,symbol:s,logoUri:u,tokenAddress:p,tokenType:m,network:g,isFetchingQuote:h,onBuyAssetClicked:w,onSwitchTokens:x})=>g&&m?e(i).createElement(e(i).Fragment,null,e(i).createElement(b,{onClick:x}),e(i).createElement(S,{roundedBottom:!0},e(i).createElement(B,{onClick:w},e(i).createElement(d.EcosystemImage,{image:{type:"fungible",src:u,fallback:s||p},size:44,tokenType:m,chainMeta:g}),e(i).createElement(F,null,e(i).createElement(y,null,n),e(i).createElement(A,null,l)),e(i).createElement(c.IconChevronDownThin,{fill:"#999999"})),e(i).createElement(M,null,e(i).createElement(f.SwapperInput,{dropdownTestID:"swap-buy-asset-dropdown",assetButtonTitle:n,decimals:r,disabled:!0,hasWarning:!1,isLoadingAmount:h,isLoadingAssets:!1,onClick:w,onUserInput:()=>{},value:a,currencyValue:o,fontSize:28})))):e(i).createElement(k,{t:t,onClick:w}))),E=()=>{const t=(()=>{const{t:e}=(0,r.useTranslation)(),{handleShowModalVisibility:t}=(0,g.useModals)(),n=(0,i.useCallback)((()=>{t("swapBuyAssetSelect")}),[t]),{isSingleChainEnabled:l}=m.hooks.useEnabledChainsInfo(),a=m.hooks.useSwapBuyAssetProps({isSingleChainEnabled:l});return Object.assign(Object.assign({},a),{onBuyAssetClicked:n,t:e})})();return e(i).createElement(x,Object.assign({},t))},k=({t:t,onClick:n})=>e(i).createElement(e(i).Fragment,null,e(i).createElement(b,null),e(i).createElement(v,{onClick:n},e(i).createElement(B,null,e(i).createElement(I,null,e(i).createElement(c.IconPlusThin,{width:20})),e(i).createElement(F,null,e(i).createElement(A,{size:16,weight:600},t("swapSelectToken")))))),S=s.default.div`
  background: #2a2a2a;
  border-top-right-radius: ${e=>e.roundedTop?8:0}px;
  border-top-left-radius: ${e=>e.roundedTop?8:0}px;
  border-bottom-right-radius: ${e=>e.roundedBottom?8:0}px;
  border-bottom-left-radius: ${e=>e.roundedBottom?8:0}px;
  padding: 8px;
`,v=(0,s.default)(S).attrs({roundedBottom:!0})`
  cursor: pointer;
`,y=(0,s.default)(p.Text).attrs({size:16,color:"#FFF",weight:600,lineHeight:19,textAlign:"left"})``,A=(0,s.default)(p.Text).attrs((e=>({size:e.size||14,color:"#777",weight:e.weight||400,lineHeight:17,textAlign:"left"})))``,C=s.default.div`
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  height: 1px;
`,T=(0,s.default)(u.Circle).attrs({color:"#AB9FF2",diameter:32})`
  z-index: 0;
  cursor: pointer;
  &:hover {
    background: #e2dffe;
  }
  margin-top: -16px;
  margin-bottom: -16px;
`,I=(0,s.default)(u.Circle).attrs({color:"#181818",diameter:44})``,B=s.default.div`
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
`})),n.register("aC1K2",(function(l,a){t(l.exports,"SwapperInput",(function(){return m}));var o=n("43063"),r=n("29o0l"),i=n("gkfw3"),s=n("kGh2H"),u=n("hiI91"),d=n("27SDj");const c=i.default.div`
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
`,p=i.default.div`
  width: 100%;
  margin-top: 11px;
  margin-bottom: 10px;
`,m=({decimals:t,disabled:n,hasWarning:l,isLoadingAmount:a,value:i,name:m="amount","aria-labelledby":f,"aria-label":b,onUserInput:h,maxSellAmount:w,setMaxSellAmount:x,currencyValue:E,fontSize:k})=>{const{t:S}=(0,o.useTranslation)();return e(r).createElement(c,{hasWarning:l,fontSize:k},a?e(r).createElement(p,null,e(r).createElement(u.SkeletonLoader,{width:"100px",height:"20px",backgroundColor:"#434343",borderRadius:"10px"})):e(r).createElement(s.NumericalInput,{"aria-labelledby":f,"aria-label":b,name:m,border:"0",placeholder:"0",warning:l,value:i,decimalLimit:t,disabled:n,onUserInput:h}),w&&void 0!==x&&e(r).createElement(g,{onClick:x},S("maxInputMax")),a?e(r).createElement(u.SkeletonLoader,{width:"50px",height:"12px",backgroundColor:"#434343",borderRadius:"10px"}):E?e(r).createElement(d.Text,{size:16,color:"#777"},E):void 0)},g=i.default.div`
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
`})),n.register("aQ8sL",(function(l,a){t(l.exports,"SwapReviewButton",(function(){return g}));var o=n("43063"),r=n("kram9"),i=n("29o0l"),s=n("hFkH3"),u=n("gX5Te"),d=n("feAoQ");const c=()=>{const{t:t}=(0,o.useTranslation)();return e(i).createElement(s.Button,{type:"submit",theme:"default",disabled:!0},t("swapFlowActionButtonText"))},p=()=>{const{disabled:t,theme:n,title:l,onClick:a}=m();return e(i).createElement(s.Button,{type:"submit",theme:n,disabled:t,onClick:a},l)},m=()=>{const{t:e}=(0,o.useTranslation)(),{hasEnoughAssets:t,hasNoRoutes:n,canSwap:l,hasNoFundsForFees:a,sourceNativeToken:s}=u.hooks.useSwapReviewButtonProps(),c=(0,r.useSwapperStore)((e=>e.setQuoteFetchIntervalToggle)),{handleShowModalVisibility:p}=(0,d.useModals)(),m=(0,i.useCallback)((()=>{a?p("insufficientBalance",{networkId:s.networkId,token:{balance:s.balance,required:s.required}}):(c(!1),p("swapReview"))}),[a,p,s.networkId,s.balance,s.required,c]);return l?{disabled:!1,theme:"primary",title:e("swapFlowActionButtonText"),onClick:m}:t?n?{disabled:!0,theme:"default",title:e("swapNoQuotesFound"),onClick:m}:{disabled:!0,theme:"default",title:e("swapFlowActionButtonText"),onClick:m}:{disabled:!0,theme:"warning",title:e("sendFormErrorInsufficientBalance"),onClick:m}},g=()=>{const{multichainQuoteResponse:t}=(0,r.useMultichainQuote)();return t?e(i).createElement(p,null):e(i).createElement(c,null)}})),n.register("gPUr2",(function(l,a){t(l.exports,"SwapWrapper",(function(){return p}));var o=n("iOvk1"),r=n("43063"),i=n("29o0l"),s=n("gkfw3"),u=n("gX5Te"),d=n("3Doua");const c=s.default.div`
  display: flex;
  flex: 1;
  padding-bottom: 16px;
  margin-bottom: -16px; // fix extension padding issue when scrollable or not
`,p=e(i).memo((({children:t})=>{const n=u.hooks.useSelectedNetworks().every((e=>o.Chains.isMainnetNetworkID(e))),{t:l}=(0,r.useTranslation)(),a=(0,i.useMemo)((()=>({availableOnlyOnMainnet:l("swapAvailableOnMainnet")})),[l]);return n?e(i).createElement(c,null,t):e(i).createElement(d.SwapNotAvailableWrapper,{message:a.availableOnlyOnMainnet,swapDisabled:!0},t)}))})),n.register("3Doua",(function(l,a){t(l.exports,"SwapNotAvailableWrapper",(function(){return g}));var o=n("RVqnc"),r=n("29o0l"),i=n("gkfw3"),s=n("27SDj");const u=i.default.div`
  overflow-y: "scroll";
  padding-top: 16px;
`,d=i.default.fieldset.attrs({disabled:!0})`
  pointer-events: none;
  user-select: none;
`,c=i.default.div`
  position: absolute;
  z-index: 1;
  top: 0;
  height: 100vh;
  width: 100%;
  background-color: ${(0,o.hexToRGB)("#222222",.75)};
`,p=i.default.div`
  background-color: ${(0,o.hexToRGB)("#E5A221",.7)};
  padding: 12px 15px;
  position: absolute;
  /* TODO: change 15px to 16px and create a screen padding constant like on mobile */
  top: -15px;
  left: -15px;
  right: 15px;
  width: calc(100% + 2 * 15px);
`,m=(0,i.default)(s.Text).attrs({size:14,lineHeight:19,weight:500,color:"#fff",textAlign:"left"})``,g=({message:t,swapDisabled:n=!0,children:l})=>n?e(r).createElement(e(r).Fragment,null,e(r).createElement(c,{"data-testid":"disable-overlay"},e(r).createElement(p,null,e(r).createElement(m,null,t))),e(r).createElement(d,{"data-testid":"disable-wrapper"},l)):e(r).createElement(u,null,e(r).createElement(p,null,e(r).createElement(m,null,t)),e(r).createElement(e(r).Fragment,null,l))}))}();
//# sourceMappingURL=SwapTabPage.87a070f1.js.map
define=__define;})(window.define);