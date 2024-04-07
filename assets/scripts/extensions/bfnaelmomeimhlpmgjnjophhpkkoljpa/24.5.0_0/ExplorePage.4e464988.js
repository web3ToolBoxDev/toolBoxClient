(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
function e(e){return e&&e.__esModule?e.default:e}function t(e,t,n,r){Object.defineProperty(e,t,{get:n,set:r,enumerable:!0,configurable:!0})}var n=("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{}).parcelRequire1d24;n.register("Cx7PX",(function(r,l){var i;i=r.exports,Object.defineProperty(i,"__esModule",{value:!0,configurable:!0}),t(r.exports,"ExplorePageContent",(function(){return y})),t(r.exports,"default",(function(){return N}));var a=n("54qyi"),o=n("4y59b"),s=n("egSKH"),c=n("lDSNw"),d=n("bjaYq"),u=n("lz7nT"),p=n("cZIbv"),m=n("kn91D"),x=n("fnNJD"),f=n("cHds5"),g=n("dk3Xb"),h=n("1tudC"),E=n("lAgRD"),b=n("gMNJN"),w=n("iacGS"),k=n("d1qx3");function y(){var t;b.hooks.useExploreLoadAllQueries();const n=(0,u.useLocation)(),{t:r}=(0,d.useTranslation)(),{data:l}=b.hooks.useShouldShowQuests({platform:"extension",appVersion:(0,k.getManifestVersion)()}),{error:i,refetch:p}=b.hooks.useQuests({platform:"extension",appVersion:(0,k.getManifestVersion)()}),{setActiveSection:m,activeSection:y}=(0,a.useExplore)();(0,c.useEffect)((()=>{var e;"quests"===(null===(e=n.state)||void 0===e?void 0:e.tab)&&l&&m("quests")}),[null===(t=n.state)||void 0===t?void 0:t.tab,l,i,m]);const{error:N,refetch:P}=b.hooks.useLearn(),{error:T,refetch:A}=b.hooks.useExploreTokens(),{error:R,refetch:M}=b.hooks.useExploreSites(),{error:$,refetch:j}=b.hooks.useExploreCollections(),{error:F,refetch:z}=b.hooks.useExploreRecommendedTokens(),{error:Z,refetch:_}=b.hooks.useExploreRecommendedSites(),{error:q,refetch:G}=b.hooks.useExploreRecommendedCollections(),B=i&&N&&T&&R&&$&&F&&Z&&q,O=(0,c.useCallback)((()=>{l&&p(),A(),M(),j(),z(),_(),G(),P()}),[p,A,M,j,z,_,G,P,l]),[Q,X]=e(c).useState(""),H=(0,o.useDebouncedState)(Q,250),U=e(s)((e=>{e&&w.exploreAnalytics.onExploreSearchedByUser({searchTerm:e})}),1e3),V=!!H;return(0,c.useEffect)((()=>{U(H)}),[H,U]),B?e(c).createElement(S,null,e(c).createElement(x.ExplorePageError,{title:r("exploreErrorTitle"),buttonText:r("exploreErrorButtonText"),description:r("exploreErrorDescription"),refetch:O})):e(c).createElement(v,null,e(c).createElement(f.ExploreSearchHeader,{value:Q,onChange:X}),e(c).createElement(C,{hide:V},e(c).createElement(E.ExploreTabsTitles,null)),e(c).createElement(I,{hide:V},e(c).createElement(h.ExploreTabs,null),"tokens"===y&&e(c).createElement(L,null,e(c).createElement(D,null,r("exploreTokensLegalDisclaimer")))),e(c).createElement(I,{hide:!V},e(c).createElement(g.ExploreSearchResults,{query:H})))}const v=p.default.div`
  position: absolute;
  display: flex;
  flex-direction: column;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
`,S=p.default.div`
  padding: 16px;
`,C=p.default.div`
  display: ${({hide:e})=>e?"none":"initial"};
  overflow-x: hidden;
`,I=(0,p.default)(C)`
  display: ${({hide:e})=>e?"none":"flex"};
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
`,L=p.default.div`
  padding: 12px 16px;
`,D=(0,p.default)(m.Text)`
  color: #999;
  font-feature-settings: "calt" off;

  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: 16px;
  text-align: left;
`;var N=()=>e(c).createElement(a.ExploreProvider,{appVersion:(0,k.getManifestVersion)(),platform:"extension",initialSection:"sites"},e(c).createElement(y,null))})),n.register("fnNJD",(function(r,l){t(r.exports,"ExplorePageError",(function(){return h}));var i=n("lDSNw"),a=n("cZIbv"),o=n("44I6u"),s=n("aanFI"),c=n("6l2nq"),d=n("kn91D");const u=(0,a.default)(o.Column).attrs({align:"center"})``,p=a.default.div`
  width: 48px;
  height: 48px;
  position: relative;
  margin-bottom: 15px;
  border-radius: 100%;
  background: rgba(255, 220, 98, 0.2);
`,m=(0,a.default)(c.Row).attrs({align:"center",justify:"center"})`
  height: 100%;
`,x=(0,a.default)(d.Text).attrs({size:17,weight:500,lineHeight:22,margin:"0 0 10px 0"})``,f=(0,a.default)(d.Text).attrs({size:15,weight:500,lineHeight:21,margin:"0 0 15px 0",color:"#777777"})``,g=(0,a.default)(d.Text).attrs({size:16,weight:500,lineHeight:22,margin:"0",color:"#AB9FF2"})``,h=e(i).memo((t=>e(i).createElement(u,null,e(i).createElement(p,null,e(i).createElement(m,null,e(i).createElement(s.IconExclamationMarkCircle,{width:22,exclamationFill:"transparent",circleFill:"#FFE920"}))),e(i).createElement(x,null,t.title),e(i).createElement(f,null,t.description),e(i).createElement(g,{onClick:t.refetch},t.buttonText))))})),n.register("cHds5",(function(r,l){t(r.exports,"ExploreSearchHeader",(function(){return c}));var i=n("lMzyG"),a=n("lDSNw"),o=n("cZIbv"),s=n("jLA72");const c=({value:t,onChange:n})=>{const{t:r}=(0,i.useTranslation)();return e(a).createElement(d,null,e(a).createElement(s.SearchInput,{placeholder:r("dappBrowserSearchPlaceholder"),value:t,onChange:e=>{"value"in e.target&&"string"==typeof e.target.value&&n(e.target.value)},showClearIcon:!!t,onClear:()=>{n("")}}))},d=o.default.div`
  padding: 16px;
  padding-bottom: 0;
`})),n.register("dk3Xb",(function(r,l){t(r.exports,"ExploreSearchResults",(function(){return x}));var i=n("c1thM"),a=n("lDSNw"),o=n("bjaYq"),s=n("cZIbv"),c=n("2PGvS"),d=n("hjnIF"),u=n("kn91D"),p=n("iacGS"),m=n("3A33D");const x=({query:t})=>{const{dapps:n,isLoading:r}=(0,m.useExploreSearchList)(t),l=(0,a.useMemo)((()=>[...new Array(5).keys()]),[]),{t:i}=(0,o.useTranslation)();return r?e(a).createElement(f,{testId:"explore-search-results-loading",items:l.map((t=>({key:t.toString(),image:e(a).createElement(k,null),textMain:e(a).createElement(d.SkeletonLoader,{width:"96px",height:"16px",marginBottom:"2px",borderRadius:"16px"}),textSecondary:e(a).createElement(d.SkeletonLoader,{width:"62px",height:"14.5px",borderRadius:"16px"})})))}):n.length?e(a).createElement(f,{testId:"explore-search-results",items:n.map(((t,n)=>({key:t.id,href:t.href,image:e(a).createElement(c.ShapedImage,{src:t.imageUrl,size:"xsmall",shape:"square"}),textMain:e(a).createElement(b,null,t.name),textSecondary:e(a).createElement(w,null,t.category),onClick:()=>{p.exploreAnalytics.onExploreSearchItemClickedByUser({itemDetails:{position:n+1,title:t.name,id:t.id}})}})))}):e(a).createElement(y,{"data-testid":"explore-search-results-nodata"},e(a).createElement(v,null,i("dappBrowserSearchNoApps")))},f=({items:t,testId:n})=>e(a).createElement(g,{"data-testid":n},t.map(((n,r)=>e(a).createElement(h,{key:n.key,href:n.href,onClick:n.onClick,whileHover:{background:"#333"},style:{background:"#222"},transition:{ease:[.5,1,.89,1],duration:.1}},e(a).createElement("div",null,n.image),e(a).createElement(E,{isLast:r===t.length-1},n.textMain,n.textSecondary))))),g=s.default.div`
  margin-top: 16px;
  width: 100%;
`,h=(0,s.default)(i.motion.a).attrs({target:"_blank",rel:"noopener noreferrer"})`
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
  text-decoration: none;
`,E=s.default.div`
  display: flex;
  flex-direction: column;
  border-bottom: ${e=>e.isLast?"none":"1px solid #323232"};
  width: 100%;
  padding: 16px 0;
`,b=(0,s.default)(u.Text)`
  text-align: left;
  font-size: 14px;
  font-style: normal;
  font-weight: 400;
  line-height: normal;
`,w=(0,s.default)(u.Text)`
  text-align: left;
  color: #999;
  font-size: 13px;
  font-style: normal;
  font-weight: 500;
  line-height: normal;
`,k=(0,s.default)(d.SkeletonLoader)`
  border-radius: 6px;
  height: 24px;
  width: 24px;
`,y=s.default.div`
  position: absolute;
  top: 64px;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding-bottom: 56px;
`,v=(0,s.default)(u.Text)`
  color: #999;
  font-size: 16px;
  font-style: normal;
  font-weight: 500;
  line-height: normal;
`})),n.register("2PGvS",(function(r,l){t(r.exports,"ShapedImage",(function(){return x}));var i=n("4y59b"),a=n("lDSNw"),o=n("cZIbv"),s=n("miiws"),c=n("c6Gae"),d=n("hjnIF");const u=e=>{if("number"==typeof e)return e;switch(null!=e?e:"small"){case"normal":return 48;case"small":return 32;case"xsmall":return 24;case"xxsmall":return 16}},p=(0,o.default)(c.PImage)`
  border-radius: ${e=>e.borderradius}px;
  width: 100%;
  height: 100%;
`,m=o.default.div`
  width: ${e=>e.width}px;
  height: ${e=>e.height}px;
  align-items: center;
  justify-content: center;
  background-color: ${e=>{var t;return(0,i.hexToRGB)(e.color,null!==(t=e.alpha)&&void 0!==t?t:.1)}};
`,x=({src:t,fallback:n,alt:r,size:l="normal",shape:i="circle",style:o})=>{const c=null!=n?n:e(a).createElement(f,null,"?"),x=u(l),g=u(l),h=(e=>"square"===e?6:0)(i);return"circle"===i?e(a).createElement(s.Circle,{color:"#222222",diameter:x,style:o},e(a).createElement(p,{src:t,fallback:c,alt:r||void 0,width:x,height:g,borderradius:h,loader:e(a).createElement(d.SkeletonLoader,{borderRadius:`${h}px`,width:`${x}px`,height:`${g}px`})})):e(a).createElement(m,{color:"#222222",width:x,height:g,style:o},e(a).createElement(p,{src:t,fallback:c,alt:r||"",width:x,height:g,borderradius:h,loader:e(a).createElement(d.SkeletonLoader,{borderRadius:`${h}px`,width:`${x}px`,height:`${g}px`})}))},f=o.default.div`
  font-size: 22px;
  line-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
`})),n.register("iacGS",(function(e,r){t(e.exports,"exploreAnalytics",(function(){return a}));var l=n("54qyi"),i=n("h5kyv");const a=new(0,l.ExploreAnalytics)(i.analytics)})),n.register("3A33D",(function(e,r){t(e.exports,"useExploreSearchList",(function(){return c}));var l=n("54qyi"),i=n("4y59b"),a=n("gmVmN"),o=n("gMNJN"),s=n("GbSLs");const c=e=>{const t=o.hooks.useEnabledNetworkIDs(),{data:n,isLoading:r}=o.hooks.useRecommendedSearchSites({networkIds:t});return{dapps:(0,s.useFuse)(n||[],(0,a.removeWebPrefixes)(e),l.FUSE_EXPLORE_DAPPS_CONFIG).map((e=>Object.assign(Object.assign({},e),{href:(0,i.getOriginAndHostname)(e.domain).origin}))),isLoading:r}}})),n.register("1tudC",(function(r,l){t(r.exports,"ExploreTabs",(function(){return m}));var i=n("lDSNw"),a=n("cecAp"),o=n("86rg0"),s=n("gBwyG"),c=n("4jLAN"),d=n("4bI2f"),u=n("28cqA"),p=n("1sMuZ");function m(){const{sections:t,activeSectionIdx:n}=(0,o.useExploreSections)(),r=(0,i.useMemo)((()=>t.map((t=>{switch(t){case"sites":return e(i).createElement(u.ExploreTabSites,null);case"tokens":return e(i).createElement(p.ExploreTabTokens,null);case"collections":return e(i).createElement(d.ExploreTabCollections,null);case"quests":return e(i).createElement(a.Quests,null);case"learn":return e(i).createElement(c.Learn,null);default:return null}}))),[t]);return e(i).createElement(s.default,{activeIndex:n,items:r})}})),n.register("cecAp",(function(r,l){t(r.exports,"Quests",(function(){return x}),(function(e){return x=e}));var i=n("6Tvfa"),a=n("lDSNw"),o=n("cZIbv"),s=n("gMNJN"),c=n("d1qx3"),d=n("8XpGW"),u=n("k4rlt"),p=function(e,t){var n={};for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&t.indexOf(r)<0&&(n[r]=e[r]);if(null!=e&&"function"==typeof Object.getOwnPropertySymbols){var l=0;for(r=Object.getOwnPropertySymbols(e);l<r.length;l++)t.indexOf(r[l])<0&&Object.prototype.propertyIsEnumerable.call(e,r[l])&&(n[r[l]]=e[r[l]])}return n};const m=e(a).memo((({quests:t,isLoading:n})=>n?e(a).createElement("div",null,e(a).createElement(d.QuestSkeletonHeader,null),e(a).createElement(d.QuestSkeleton,null),e(a).createElement(d.QuestSkeleton,null)):e(a).createElement("div",null,e(a).createElement(u.QuestsList,{quests:t})))),x=()=>{const t=(()=>{const{data:e=[],isLoading:t,error:n}=s.hooks.useQuests({platform:"extension",appVersion:(0,c.getManifestVersion)()}),{data:r}=s.hooks.useSelectedMultiChainAccount(),{data:l}=s.hooks.useIsAnalyticsOptedOut();return(0,a.useMemo)((()=>({shouldShowQuests:!l&&(null==r?void 0:r.type)!==i.AccountType.ReadOnly&&!n,quests:e,isLoading:t})),[r,e,l,t,n])})(),{shouldShowQuests:n}=t,r=p(t,["shouldShowQuests"]);return n?e(a).createElement(f,{"data-testid":"quests"},e(a).createElement(m,Object.assign({},r))):null},f=o.default.div`
  padding: 16px;
  padding-top: 0;
`})),n.register("8XpGW",(function(r,l){t(r.exports,"Separator",(function(){return f})),t(r.exports,"QuestSkeletonHeader",(function(){return g})),t(r.exports,"QuestSkeleton",(function(){return h}));var i=n("lDSNw"),a=n("cZIbv"),o=n("44I6u"),s=n("6l2nq"),c=n("hjnIF");const d="14px",u="8px",p="#484848",m=(0,a.default)(c.SkeletonLoader)`
  width: 100%;
  height: 144px;
  border-top-left-radius: ${u};
  border-top-right-radius: ${u};
`,x=(0,a.default)(c.SkeletonLoader).attrs({backgroundColor:"#484848",borderRadius:"8px"})``,f=a.default.div`
  background: #474747;
  height: 1px;
  opacity: 0.6;
  width: 100%;
`,g=()=>e(i).createElement(c.SkeletonLoader,{align:"center",width:"150px",height:"30px",backgroundColor:"#2D2D2D",borderRadius:u,margin:"0 auto 17px auto"}),h=()=>e(i).createElement(e(i).Fragment,null,e(i).createElement(c.SkeletonLoader,{width:"100%",height:"308px",backgroundColor:"#2D2D2D",borderRadius:u,margin:"0 0 10px 0"},e(i).createElement(o.Column,null,e(i).createElement(m,{align:"flex-start",justify:"flex-end",margin:"0 0 10px"},e(i).createElement(x,{align:"flex-start",justify:"flex-end",width:"65px",height:"20px",margin:"10px 10px 0 0",borderRadius:"32px"})),e(i).createElement(o.Column,{padding:"16px"},e(i).createElement(c.SkeletonLoader,{justify:"flex-start",width:"60px",height:d,backgroundColor:p,borderRadius:"8px",margin:"0 0 17px 0"}),e(i).createElement(c.SkeletonLoader,{justify:"flex-start",width:"125px",height:d,backgroundColor:p,borderRadius:u})),e(i).createElement(f,null),e(i).createElement(s.Row,{padding:"16px"},e(i).createElement(c.SkeletonLoader,{width:"40px",height:"40px",backgroundColor:p,borderRadius:u}),e(i).createElement(o.Column,{width:"auto",margin:"0 0 0 10px"},e(i).createElement(c.SkeletonLoader,{justify:"flex-start",width:"60px",height:d,backgroundColor:p,borderRadius:u,margin:"0 0 5px 0"}),e(i).createElement(c.SkeletonLoader,{justify:"flex-start",width:"125px",height:d,backgroundColor:p,borderRadius:u}))))))})),n.register("k4rlt",(function(r,l){t(r.exports,"QuestsList",(function(){return o}));var i=n("lDSNw"),a=n("bvnT7");const o=({quests:t})=>e(i).createElement(e(i).Fragment,null,t.map((t=>e(i).createElement(a.QuestListItem,Object.assign({key:t.id},t)))))})),n.register("bvnT7",(function(e,r){t(e.exports,"QuestListItem",(function(){return I}));var l=n("lMzyG"),i=n("8NH57"),a=n("lDSNw"),o=n("cZIbv"),s=n("jl49C"),c=n("2LZGp"),d=n("ktQU4"),u=n("laYjG"),p=n("miiws"),m=n("kn91D"),x=n("eLIAP"),f=n("8XpGW"),g=n("fLLui");const h=o.default.div`
  border: 1px solid rgba(71, 71, 71, 0.4);
  border-radius: ${12}px;
  box-shadow: ${e=>e.isPreview?"":"0px 4px 20px 0px rgba(0, 0, 0, 0.25)"};
  cursor: ${e=>e.isDisabled||e.isPreview?"auto":"pointer"};
  margin-bottom: 24px;
  position: relative;
`,E=o.default.div`
  background-color: rgba(44, 45, 48, 0.5);
  border-radius: ${12}px;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
`,b=o.default.div`
  align-items: center;
  border-top-left-radius: ${12}px;
  border-top-right-radius: ${12}px;
  display: flex;
  height: 144px;
  justify-content: center;
  overflow: hidden;
`,w=o.default.img`
  max-width: 100%;
`,k=o.default.div`
  padding: 16px;
`,y=(0,o.default)(m.Text)`
  margin-bottom: 8px;
`,v=(0,o.default)(m.Text)``,S=(0,o.default)(p.Circle).attrs({diameter:32})`
  background-color: transparent;
  border: 1px solid #333333;
`,C=a.memo((e=>{const{titleLong:t,imageUrl:n,description:r,isCompleted:l,reward:i,badge:o,isPreview:s,questState:c,onClickQuest:d,onClickQuestRewardPreview:u,onClaimQuestReward:p}=e;return a.createElement(h,{onClick:d,isDisabled:l,isPreview:s,"data-testid":"quest-list-item"},a.createElement(b,null,a.createElement(w,{src:n}),o&&a.createElement(g.QuestStatusBadge,{color:o.color,text:o.text}),s&&a.createElement(E,null)),a.createElement(f.Separator,null),a.createElement(k,null,a.createElement(y,{textAlign:"left",size:16,weight:500,lineHeight:19},t),a.createElement(v,{color:"#999",textAlign:"left",weight:400,lineHeight:17,size:14},r)),i&&a.createElement(a.Fragment,null,a.createElement(f.Separator,null),a.createElement(x.QuestRewardSection,{isQuestCompleted:l,questState:c,reward:i,onClickQuestRewardPreview:u,onClaimQuestReward:p})))})),I=e=>{const t=(e=>{const{t:t}=(0,l.useTranslation)(),{id:n,titleShort:r,networkIds:o,interstitial:p,reward:x,isPreview:f,previewUrl:g,questState:h}=e,{handleShowModalVisibility:E,handleHideModalVisibility:b}=(0,c.useModals)(),w=(0,s.useDeepLink)(),k=a.useMemo((()=>["claimed","completed_unclaimable","completed"].includes(h)),[h]),y=a.useCallback((e=>{if(f&&null!=g)return d.questAnalytics.onQuestPreviewUrlClick({questId:n,shortName:r},g),void w(e,{destinationType:i.DeepLinkDestination.ExternalLink,url:g});if(k||null==p)return;const{destinationType:t,url:l,lineItems:o,primaryButtonText:s,secondaryButtonText:c,title:x}=p,h=s.length>19||c.length>19;d.questAnalytics.onQuestSelected({questId:n,shortName:r}),E("interstitial",{bodyTitle:x,details:o.map(((e,t)=>({icon:a.createElement(S,null,a.createElement(m.Text,{size:14},t+1)),title:e.title,subtitle:e.description}))),icon:p.imageUrl,onDismiss:()=>{d.questAnalytics.onQuestInterstitialDismiss({questId:n,shortName:r})},FooterComponent:()=>a.createElement(u.ButtonGroup,{vertical:h,buttons:[{text:c,onClick:()=>{d.questAnalytics.onQuestInterstitialSecondaryClick({questId:n,shortName:r,buttonText:c}),b("interstitial")}},{text:s,theme:"primary",onClick:()=>{d.questAnalytics.onQuestInterstitialPrimaryClick({questId:n,shortName:r,buttonText:s}),w(e,{destinationType:t,url:l}),b("interstitial")}}]})})}),[E,b,p,w,n,k,f,g,r]),v=a.useCallback((e=>{if(k||null==x||x.hasClaimed)return;e.stopPropagation();const{title:n,description:r,imageUrl:l}=x;E("interstitial",{bodyTitle:n,bodyDescription:r,icon:l,FooterComponent:()=>a.createElement(u.Button,{onClick:()=>b("interstitial")},t("commandDismiss"))})}),[k,E,b,x,t]),C=a.useCallback((()=>{null==x||x.hasClaimed||(d.questAnalytics.onQuestRewardClaimed({questId:n,shortName:r}),E("claimReward",{questId:n,networkIds:o,onPressDismiss:()=>b("claimReward")}))}),[x,n,o,E,b,r]);return a.useMemo((()=>Object.assign(Object.assign({},e),{isCompleted:k,onClickQuestRewardPreview:v,onClaimQuestReward:C,onClickQuest:y})),[k,e,y,v,C])})(e);return a.createElement(C,Object.assign({},t))}})),n.register("jl49C",(function(r,l){t(r.exports,"useDeepLink",(function(){return m}));var i=n("8NH57"),a=n("lDSNw"),o=n("lz7nT"),s=n("aXzxc"),c=n("7J3aJ"),d=n("8182A"),u=n("d1qx3"),p=n("lrImj");const m=()=>{const{showSettingsMenu:t}=(0,c.useSettingsMenu)(),{showBuyFungibleSelectionModal:n}=(0,s.useLegacyModals)(),r=(0,o.useNavigate)();return(0,a.useCallback)(((l,o)=>{const{destinationType:s,url:c}=o;switch(s){case i.DeepLinkDestination.ExternalLink:(0,u.openTabAsync)({url:c});break;case i.DeepLinkDestination.Buy:n();break;case i.DeepLinkDestination.Collectibles:r(d.Path.Collectibles);break;case i.DeepLinkDestination.Explore:r(d.Path.Explore);break;case i.DeepLinkDestination.Quests:r(d.Path.Explore,{state:{tab:"quests",date:Date.now()}});break;case i.DeepLinkDestination.Swapper:r(d.Path.Swap);break;case i.DeepLinkDestination.SettingsImportSeedPhrase:(0,u.openTabAsync)({url:"onboarding.html?append=true"});break;case i.DeepLinkDestination.ConnectHardwareWallet:(0,u.openTabAsync)({url:"connect_hardware.html"});break;default:{const n=(0,p.getSanityComponentMapping)(s);if(!n)return;t(l,e(a).createElement(n,null))}}}),[r,t,n])}})),n.register("lrImj",(function(e,r){t(e.exports,"getSanityComponentMapping",(function(){return a}));var l=n("8NH57"),i=n("i14LG");const a=e=>{if(e===l.DeepLinkDestination.SettingsSecurityAndPrivacy)return i.MultiChainSecurity}})),n.register("ktQU4",(function(e,r){t(e.exports,"questAnalytics",(function(){return a}));var l=n("bUo8j"),i=n("h5kyv");const a=new(0,l.QuestAnalytics)(i.analytics)})),n.register("eLIAP",(function(r,l){t(r.exports,"QuestRewardSection",(function(){return x}));var i=n("lMzyG"),a=n("lDSNw"),o=n("cZIbv"),s=n("laYjG"),c=n("aanFI"),d=n("kn91D");const u=o.default.div`
  padding: 16px;
`,p=o.default.div`
  align-self: center;
  margin-right: 8px;
`,m=(0,o.default)(s.Button).attrs({theme:"primary"})`
  align-self: center;
  height: 32px;
  max-width: 80px;
  padding: 8px 14px;
  width: auto;
`,x=({isQuestCompleted:t,questState:n,reward:r,onClickQuestRewardPreview:l,onClaimQuestReward:o})=>{const{t:s}=(0,i.useTranslation)(),x="completed"===n||"claimed"===n,f=s("claimed"===n?"pastParticipleClaimed":"commandClaim");return e(a).createElement(u,null,e(a).createElement("div",{style:{display:"flex"}},e(a).createElement("div",{onClick:l,style:{cursor:t?"auto":"pointer",display:"flex",flexGrow:1,marginRight:16}},e(a).createElement(p,null,e(a).createElement(c.IconReward,null)),e(a).createElement("div",null,e(a).createElement(d.Text,{color:"#999",textAlign:"left",size:13,lineHeight:16},s("reward")),e(a).createElement(d.Text,{textAlign:"left",size:14,weight:600,lineHeight:16},r.title))),x&&e(a).createElement(m,{onClick:o,disabled:"claimed"===n},e(a).createElement(d.Text,{color:"#222",weight:600,lineHeight:16,size:13},f))))}})),n.register("fLLui",(function(r,l){t(r.exports,"QuestStatusBadge",(function(){return s}));var i=n("lDSNw"),a=n("cZIbv"),o=n("kn91D");const s=({color:t,text:n})=>e(i).createElement(c,null,e(i).createElement(d,{color:t},n)),c=a.default.div`
  background: rgba(34, 34, 34, 0.8);
  backdrop-filter: blur(2px);
  border-radius: 32px;
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
`,d=(0,a.default)(o.Text)`
  color: ${e=>e.color};
  font-size: 13px;
  font-weight: 600;
  line-height: normal;
`})),n.register("86rg0",(function(e,r){t(e.exports,"useExploreSections",(function(){return s}));var l=n("54qyi"),i=n("lDSNw"),a=n("gMNJN"),o=n("d1qx3");const s=()=>{const{data:e}=a.hooks.useShouldShowQuests({platform:"extension",appVersion:(0,o.getManifestVersion)()}),{activeSection:t,sections:n}=(0,l.useExplore)(),r=(0,i.useMemo)((()=>n.filter((t=>!("quests"===t&&!e)))),[n,e]),s=(0,i.useMemo)((()=>r.indexOf(t)),[t,r]);return{sections:r,activeSectionIdx:s}}})),n.register("gBwyG",(function(r,l){t(r.exports,"default",(function(){return s}));var i=n("lDSNw"),a=n("jVSWn"),o=n("cZIbv");function s({activeIndex:t,items:n,animateFirstTime:r=!1}){const[l,o]=e(i).useState(!0),s=(0,a.default)(t),u=t-(s||0)>0;return(0,i.useEffect)((()=>{t!==s&&o(!1)}),[t,s,o]),e(i).createElement(d,null,n.map(((n,a)=>e(i).createElement(c,{key:`animation-slide-left-${a}`,testID:`animation-item-${a}`,active:t===a,isLeft:u,shouldAnimate:!!r||!l,inView:!u&&t===a-1||u&&t===a+1||t===a},n))))}const c=({active:t,children:n,testID:r,isLeft:l,shouldAnimate:a,inView:o})=>e(i).createElement(u,{active:t,"data-testid":r,shouldAnimate:a,isLeft:l,inView:o},n),d=o.default.div`
  position: relative;
  width: 100%;
  height: ${e=>e.height?`${e.height}px`:"auto"};
  padding-top: 16px;
`,u=o.default.div`
  display: ${e=>e.active?"block":"none"};
  visibility: ${e=>e.inView?"visible":"hidden"};
  animation-name: ${e=>e.isLeft?e.active?p:f:e.active?x:m};
  animation-duration: ${e=>e.shouldAnimate?"0.5s":"0s"};
  animation-fill-mode: forwards;
  animation-timing-function: ease-in-out;
  transition: opacity 0.5s ease-in-out;
`,p=o.keyframes`
  0% {
    left: 300px;
    opacity: 0;
  };
  100%  {
    left: 0px;
    opacity: 1
  };
`,m=o.keyframes`
  0% {
    left: 0px;
    opacity: 1;
  };
  90% {
    left: 300px;
    opacity: 0;
  };
  100%  {
    left: 600px;
    opacity: 0;
  };
`,x=o.keyframes`
  0% {
    left: -300px;
    opacity: 0;
  };
  100%  {
    left: 0px;
    opacity: 1
  };
`,f=o.keyframes`
  0% {
    left: 0px;
    opacity: 1;
  };
  90% {
    left: -300px;
    opacity: 0;
  };
  100%  {
    left: -600px;
    opacity: 0;
  };
`})),n.register("4jLAN",(function(r,l){t(r.exports,"Learn",(function(){return p}));var i=n("lDSNw"),a=n("bjaYq"),o=n("cZIbv"),s=n("bpx2y"),c=n("gMNJN"),d=n("kCMom"),u=n("7R9fe");const p=()=>{const{isLoading:t,data:n,error:r,refetch:l}=c.hooks.useLearn(),{t:o}=(0,a.useTranslation)();return r&&!t&&!n||0===(null==n?void 0:n.data.length)?e(i).createElement(x,null,e(i).createElement(s.ErrorView,{title:o("exploreLearnErrorTitle"),description:o("exploreLearnErrorDescription"),refetch:l})):e(i).createElement(m,{"data-testid":"learn-container"},t?e(i).createElement(u.LearnSkeleton,null):e(i).createElement(d.LearnCards,{items:(null==n?void 0:n.data)||[]}))},m=o.default.div`
  padding: 0 16px 16px 16px;
`,x=o.default.div`
  padding: 16px;
`})),n.register("kCMom",(function(r,l){t(r.exports,"LearnCards",(function(){return p}));var i=n("lDSNw"),a=n("cZIbv"),o=n("kn91D"),s=n("iacGS"),c=n("1GaZ5");const d=({item:t,position:n})=>e(i).createElement(x,{hidePointer:!0,halfWidth:"half-width"===t.layout,"data-testid":"learn-card-tip",onClick:()=>{s.exploreAnalytics.onExploreLearnItemClickedByUser({itemDetails:{position:n,id:t.id,title:t.title,type:"tip"}})}},e(i).createElement(g,{background:t.backgroundColor},e(i).createElement(h,null,e(i).createElement(E,null,e(i).createElement(y,{color:"black",opacity:.5},e(i).createElement(S,{"data-testid":"learn-card-tip-icon"},e(i).createElement("img",{width:"16px",height:"16px",src:t.icon})),t.title)),e(i).createElement(E,null,e(i).createElement(k,{opacity:.7},t.description))))),u=({item:t,position:n})=>{const r=(0,i.useCallback)((()=>{s.exploreAnalytics.onExploreLearnItemClickedByUser({itemDetails:{position:n,id:t.id,title:t.title,type:"article"}})}),[t.id,t.title,n]);return"half-width"===t.layout?e(i).createElement(f,{href:t.url,onClick:r},e(i).createElement(x,{halfWidth:!0,"data-testid":"learn-card-article-half"},e(i).createElement(g,null,e(i).createElement(w,{style:{height:"50%"}},e(i).createElement(v,{src:t.backgroundImageUrl})),e(i).createElement(b,{background:t.backgroundColor},e(i).createElement(k,null,t.title))))):e(i).createElement(f,{href:t.url,onClick:r},e(i).createElement(x,{"data-testid":"learn-card-article-full"},e(i).createElement(g,{background:t.backgroundColor},e(i).createElement(h,null,e(i).createElement(k,null,t.title),e(i).createElement(y,{color:"#474747"},t.description))),e(i).createElement(g,null,e(i).createElement(v,{src:t.backgroundImageUrl}))))},p=({items:t})=>e(i).createElement(m,{"data-testid":"learn-cards"},t.map(((t,n)=>"learnArticle"===t.type?e(i).createElement(u,{item:t,key:t.title,position:n}):e(i).createElement(d,{item:t,key:t.title,position:n})))),m=a.default.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
  gap: 8px;
`,x=a.default.div`
  border-radius: 16px;
  height: ${c.EXPLORE_CARD_SIZE_PX};
  display: flex;
  overflow: hidden;
  cursor: ${e=>e.hidePointer?"auto":"pointer"};
  width: ${e=>e.halfWidth?"calc(50% - 4px)":"auto"};
`,f=a.default.a.attrs({target:"_blank",rel:"noopener noreferrer"})`
  text-decoration: none;
  display: contents;
`,g=a.default.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  background: ${e=>e.background||"auto"};
`,h=a.default.div`
  padding: 12px 16px;
  display: flex;
  height: 100%;
  flex-direction: column;
  justify-content: space-between;
`,E=a.default.div`
  display: flex;
`,b=(0,a.default)(E)`
  padding: 16px;
  background: ${e=>e.background||"auto"};
`,w=(0,a.default)(E)`
  flex: 1;
`,k=(0,a.default)(o.Text)`
  text-align: left;
  color: black;
  font-size: 18px;
  font-style: normal;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: -0.36px;
`,y=(0,a.default)(o.Text)`
  text-align: left;
  font-size: 14px;
  font-style: normal;
  font-weight: 600;
  line-height: normal;
  display: flex;
  align-items: center;
`,v=a.default.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`,S=a.default.span`
  display: flex;
  margin-right: 4px;
`})),n.register("1GaZ5",(function(e,r){t(e.exports,"EXPLORE_CARD_SIZE",(function(){return l})),t(e.exports,"EXPLORE_CARD_SIZE_PX",(function(){return i}));const l=(n("ibYAx").PHANTOM_WIDTH-40)/2,i=`${l}px`})),n.register("7R9fe",(function(r,l){t(r.exports,"LearnSkeleton",(function(){return u}));var i=n("lDSNw"),a=n("cZIbv"),o=n("hjnIF"),s=n("1GaZ5");const c=()=>e(i).createElement(m,null,e(i).createElement(f,null,e(i).createElement(h,{width:"110px"}),e(i).createElement(h,{width:"90px"}),e(i).createElement(h,{width:"105px"})),e(i).createElement(x,null,e(i).createElement(h,{width:"64px"}))),d=()=>e(i).createElement(m,null,e(i).createElement(f,null,e(i).createElement(h,{width:"110px"}),e(i).createElement(h,{width:"90px"}))),u=()=>e(i).createElement(p,{"data-testid":"learn-skeleton"},e(i).createElement(c,null),e(i).createElement(g,null,e(i).createElement(d,null),e(i).createElement(d,null)),e(i).createElement(c,null)),p=a.default.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 10px;
`,m=(0,a.default)(o.SkeletonLoader)`
  background: #323232;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: ${s.EXPLORE_CARD_SIZE_PX};
  border-radius: 14px;
  padding: 16px;
  justify-content: flex-end;
`,x=a.default.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
`,f=a.default.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`,g=a.default.div`
  display: flex;
  gap: 8px;
`,h=(0,a.default)(o.SkeletonLoader)`
  height: 16px;
  border-radius: 16px;
`})),n.register("4bI2f",(function(r,l){t(r.exports,"ExploreTabCollections",(function(){return u}));var i=n("lDSNw"),a=n("gMNJN"),o=n("fs8H6"),s=n("hTknS"),c=n("5oT4X"),d=n("706Mc");const u=()=>{const{isPreviousData:t}=a.hooks.useExploreCollections(),{isExploreLoading:n}=a.hooks.useIsExploreLoading();return e(i).createElement("div",null,e(i).createElement(o.CarouselCollections,null),n&&!t?e(i).createElement(c.ExploreFiltersSkeleton,null):e(i).createElement(s.default,{tab:"collections"}),e(i).createElement(d.ExploreListCollections,null))}})),n.register("fs8H6",(function(r,l){t(r.exports,"CarouselCollections",(function(){return p}));var i=n("lDSNw"),a=n("cZIbv"),o=n("gMNJN"),s=n("iacGS"),c=n("h868b"),d=n("aKaH8"),u=n("ifWd7");function p(){var t;const{error:n,data:r}=o.hooks.useExploreRecommendedCollections(),{isExploreLoading:l}=o.hooks.useIsExploreLoading(),a=(0,i.useCallback)(((t,n)=>e(i).createElement(m,{href:t.marketplacePages[0].collectionUrl},e(i).createElement(u.CarouselCardContainer,{key:`carousel-card-collections-${n}`,onPress:()=>{s.exploreAnalytics.onExploreCarouselItemClickedByUser({datasourceId:(null==r?void 0:r.uuid)||"",carouselName:"collections",itemDetails:{position:n,title:t.name,id:t.id}})}},e(i).createElement(d.CarouselCardCollection,{collection:t})))),[null==r?void 0:r.uuid]);return e(i).createElement(c.default,{name:"collections",items:r?r.data:[],renderCard:a,isLoading:l,isEmpty:!(!n||(null==r?void 0:r.data)&&0!==(null===(t=null==r?void 0:r.data)||void 0===t?void 0:t.length))})}const m=a.default.a.attrs({target:"_blank",rel:"noopener noreferrer"})`
  text-decoration: none;
  display: contents;
`})),n.register("h868b",(function(r,l){t(r.exports,"default",(function(){return b}));var i=n("bK93X"),a=n("7dqns"),o=n("c1thM"),s=n("1bdlq"),c=n("8GcfJ"),d=n("lDSNw"),u=n("cZIbv"),p=n("aanFI"),m=n("iacGS"),x=n("1GaZ5"),f=n("fwQxH");const g=-1*(x.EXPLORE_CARD_SIZE+8),h={type:"spring",stiffness:256.1,damping:24,mass:1},E=2;function b({items:t,renderCard:n,isLoading:r,isEmpty:l,name:o}){const[u,x]=(0,d.useState)(0),[b,S]=(0,d.useState)(!1),C=(0,s.useMotionValue)(0),I=(0,d.useMemo)((()=>g*(t.length-E)),[t]),L=(0,d.useCallback)((e=>e<0?0:e>t.length-1?t.length-1:e),[t]),D=(0,d.useCallback)((()=>L(Math.round(C.get()/g))),[C,L]);(0,c.useMotionValueEvent)(C,"change",(()=>{x(D())}));const N=(0,d.useCallback)((e=>{const t=L(e)*g;(0,i.animate)(C,t,h),m.exploreAnalytics.onExploreCarouselDragged({listName:o})}),[L,C,o]),P={fill:"#222",width:16,height:16};return r?e(d).createElement(f.CarouselSkeleton,null):l?null:e(d).createElement(w,{"data-testid":`explore-carousel-${o}`},e(d).createElement(a.AnimatePresence,{initial:!1},u>=1&&e(d).createElement(v,{onClick:()=>N(u-1)},e(d).createElement(p.IconArrowLeftThin,Object.assign({},P)))),e(d).createElement(a.AnimatePresence,{initial:!1},u<=t.length-E-1&&e(d).createElement(v,{isRight:!0,onClick:()=>N(u+1)},e(d).createElement(p.IconArrowRightThin,Object.assign({},P)))),e(d).createElement(k,{style:{x:C},drag:t.length>E?"x":void 0,dragConstraints:{left:I,right:0},onDragStart:()=>S(!0),onDragEnd:()=>{S(!1),N(D()),m.exploreAnalytics.onExploreCarouselDragged({listName:o})},onWheel:e=>{if(0===e.deltaX)return;const t=C.get()-e.deltaX;return t>0?C.set(0):t<I?C.set(I):C.set(t)}},t.map(((r,l)=>e(d).createElement(y,{key:`carousel-item-${l}`,isLast:l===t.length-1,onClick:e=>{b&&(e.stopPropagation(),e.preventDefault())},transition:{type:"spring",damping:20,stiffness:400,duration:.6,mass:1},whileHover:{scale:1.05}},n(r,l))))))}const w=u.default.div`
  width: 100vw;
  margin-bottom: 24px;
`,k=(0,u.default)(o.motion.div)`
  display: flex;
  flex-direction: row;
  padding: 0 16px;
`,y=(0,u.default)(o.motion.div)`
  position: relative;
  margin-right: ${e=>e.isLast?0:8}px;
`,v=(0,u.default)(o.motion.div).attrs({transition:{ease:[.16,1,.3,1],duration:.5},initial:{opacity:0,translateY:8},animate:{opacity:1,translateY:0},exit:{opacity:0,translateY:8}})`
  background: #ab9ff2;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  position: absolute;
  z-index: 1;
  left: ${e=>e.isRight?"auto":"4px"};
  right: ${e=>e.isRight?"4px":"auto"};
  top: ${x.EXPLORE_CARD_SIZE/2}px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  box-shadow:
    0px 1px 2px 0px rgba(0, 0, 0, 0.19),
    0px 3px 3px 0px rgba(0, 0, 0, 0.17),
    0px 7px 4px 0px rgba(0, 0, 0, 0.1),
    0px 12px 5px 0px rgba(0, 0, 0, 0.03),
    0px 18px 5px 0px rgba(0, 0, 0, 0);
`})),n.register("8GcfJ",(function(e,r){t(e.exports,"useMotionValueEvent",(function(){return i}));var l=n("lDSNw");function i(e,t,n){(0,l.useInsertionEffect)((()=>e.on(t,n)),[e,t,n])}})),n.register("fwQxH",(function(r,l){t(r.exports,"CarouselSkeleton",(function(){return c}));var i=n("lDSNw"),a=n("cZIbv"),o=n("hjnIF"),s=n("1GaZ5");function c({items:t=10}){const n=(0,i.useMemo)((()=>{const e=[];for(let n=0;n<t;n++)e.push(n);return e}),[t]);return e(i).createElement(u,null,n.map((t=>e(i).createElement(d,{key:t}))))}function d(){return e(i).createElement(p,null,e(i).createElement(x,null,e(i).createElement(f,null,e(i).createElement(o.SkeletonLoader,{width:"90px",height:"16px",marginBottom:"4px",borderRadius:"16px"}),e(i).createElement(o.SkeletonLoader,{width:"64px",height:"16px",borderRadius:"16px"})),e(i).createElement(m,null)))}const u=a.default.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  padding-left: 16px;
  margin-bottom: 24px;
`,p=(0,a.default)(o.SkeletonLoader)`
  background: #323232;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 8px 8px 12px;

  margin-right: 8px;
  border-radius: 16px;
  height: ${s.EXPLORE_CARD_SIZE_PX};
  width: ${s.EXPLORE_CARD_SIZE_PX};
  min-width: ${s.EXPLORE_CARD_SIZE_PX};
`,m=(0,a.default)(o.SkeletonLoader)`
  background: ${e=>e.theme.skeletonLight};
  border-radius: 14px;
  height: 48px;
  width: 48px;
  margin-bottom: 8px;
`,x=a.default.div`
  display: flex;
  width: 100%;
  flex-direction: row;
  justify-content: space-between;
`,f=a.default.div`
  display: flex;

  flex-direction: column;
  justify-content: flex-end;
`})),n.register("aKaH8",(function(r,l){t(r.exports,"CarouselCardCollection",(function(){return u}));var i=n("4y59b"),a=n("3yHS8"),o=n("lDSNw"),s=n("gmVmN"),c=n("cZIbv"),d=n("ctrIg");const u=({collection:t})=>{const n=(0,o.useMemo)((()=>{const n=new(e(a))(t.floorPrices[0].value,10).dividedBy(new(e(a))(10).pow(t.floorPrices[0].paymentToken.decimals)).toNumber();return`${(0,s.formatNumber)(n)} ${t.floorPrices[0].paymentToken.symbol} `}),[t.floorPrices]);return e(o).createElement(d.CarouselBackgroundImageCard,{src:t.imageUrl},e(o).createElement(p,null,e(o).createElement("div",null,e(o).createElement(m,null,(0,i.truncateString)(t.name,9)),e(o).createElement(x,null,n))))},p=c.default.div`
  width: 100%;
  padding: 8px 12px;
`,m=c.default.div`
  font-size: 18px;
  font-weight: 600;
  line-height: 22px;
`,x=c.default.div`
  font-weight: 600;
  color: ${e=>e.theme.grayLight};
  font-size: 14px;
  line-height: 18px;
`})),n.register("ctrIg",(function(r,l){t(r.exports,"CarouselBackgroundImageCard",(function(){return c}));var i=n("lDSNw"),a=n("cZIbv"),o=n("c6Gae"),s=n("1GaZ5");const c=({src:t,children:n})=>e(i).createElement(e(i).Fragment,null,e(i).createElement(d,{src:t}),e(i).createElement(u,null,n)),d=(0,a.default)(o.PImage)`
  width: ${s.EXPLORE_CARD_SIZE_PX};
  height: ${s.EXPLORE_CARD_SIZE_PX};
  border-radius: 16px;
`,u=a.default.div`
  position: absolute;
  left: 0;
  background: rgba(24, 24, 24, 0.8);
  backdrop-filter: blur(24px);
  width: 100%;
  height: 54px;

  /* reduce by 1 pixel to prevent border-radius clipping issue */
  bottom: -1px;
  border-bottom-left-radius: 15px;
  border-bottom-right-radius: 15px;
`})),n.register("ifWd7",(function(r,l){t(r.exports,"CarouselCardContainer",(function(){return s}));var i=n("lDSNw"),a=n("cZIbv"),o=n("1GaZ5");function s({children:t,onPress:n}){return e(i).createElement(c,{onClick:n},t,e(i).createElement(d,null))}const c=a.default.div`
  width: ${o.EXPLORE_CARD_SIZE_PX};
  height: ${o.EXPLORE_CARD_SIZE_PX};
  position: relative;
  cursor: pointer;
  overflow: hidden;
`,d=a.default.div`
  background: transparent;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  cursor: pointer;
`})),n.register("hTknS",(function(r,l){t(r.exports,"default",(function(){return E}));var i=n("belzv"),a=n("54qyi"),o=n("lBuGR"),s=n("lMzyG"),c=n("c1thM"),d=n("lDSNw"),u=n("cZIbv"),p=n("2tQxs"),m=n("aanFI"),x=n("gMNJN"),f=n("a8kcR"),g=n("iacGS");const h="200px";function E({tab:t}){const{data:n,mutate:r}=x.hooks.useExploreSelectedNetwork(),{currentSortOption:l,getSortOptions:i,setSortOption:a}=x.hooks.useExploreSortOption(),o=i(t),s=l(t);return e(d).createElement(y,{"data-testid":`explore-filters-${t}`},e(d).createElement(k,{value:s,options:o,onChange:e=>{(e=>{a(t,e)})(e),g.exploreAnalytics.onExploreFilterChangedByUser({filterType:"sort",filterValue:e,listName:t})}}),e(d).createElement(w,{value:n,onChange:e=>{r(e),g.exploreAnalytics.onExploreFilterChangedByUser({filterType:"network",filterValue:e,listName:t})}}))}const b=({networkLabel:t,NetworkIcon:n})=>{const[r,l]=e(d).useState(!1);return e(d).createElement(S,{onMouseEnter:()=>l(!0),onMouseLeave:()=>l(!1)},e(d).createElement("span",{style:{color:r?f.theme.purple:f.theme.white}},t)," ",e(d).createElement(n,{width:20,height:20,fill:r?f.theme.purple:f.theme.white}))};function w({value:t,onChange:n}){const{t:r}=(0,s.useTranslation)(),{data:[l]}=(0,o.useFeatureFlags)(["enable-bitcoin-explore"]),{data:c}=x.hooks.useSelectedMultiChainAccount(),u=(0,d.useMemo)((()=>{const t=[],o=c?(0,a.getAccountMainnetNetworkIds)(c,l):[];return o.includes(i.SolanaNetworkID.Mainnet)&&t.push({label:e(d).createElement(b,{networkLabel:"Solana",NetworkIcon:m.IconChainSolana}),key:"Solana",onClick:()=>n(i.SolanaNetworkID.Mainnet)}),o.includes(i.EthereumNetworkID.Mainnet)&&t.push({label:e(d).createElement(b,{networkLabel:"Ethereum",NetworkIcon:m.IconChainEthereum}),key:"Ethereum",onClick:()=>n(i.EthereumNetworkID.Mainnet)}),o.includes(i.PolygonNetworkID.Mainnet)&&t.push({label:e(d).createElement(b,{networkLabel:"Polygon",NetworkIcon:m.IconChainPolygon}),key:"Polygon",onClick:()=>n(i.PolygonNetworkID.Mainnet)}),o.includes(i.BitcoinNetworkID.Mainnet)&&l&&t.push({label:e(d).createElement(b,{networkLabel:"Bitcoin",NetworkIcon:m.IconChainBitcoin}),key:"Bitcoin",onClick:()=>n(i.BitcoinNetworkID.Mainnet)}),t.length>1&&t.push({label:e(d).createElement(b,{networkLabel:r("exploreFilterByall_networks"),NetworkIcon:m.IconStackedLayers}),key:"all_networks",onClick:()=>n("all_networks")}),t}),[n,r,l,c]);return u.length>1?e(d).createElement(v,null,e(d).createElement(p.Dropdown,{items:u,dropdownWidth:h,noDropdownItemPadding:!0},e(d).createElement(C,null,e(d).createElement(I,null,(e=>{switch(e){case i.SolanaNetworkID.Mainnet:return"Solana";case i.EthereumNetworkID.Mainnet:return"Ethereum";case i.PolygonNetworkID.Mainnet:return"Polygon";case i.BitcoinNetworkID.Mainnet:return"Bitcoin";case"all_networks":return r("exploreFilterByall_networks");default:return""}})(t)),e(d).createElement(m.IconChevronDown,{width:12,height:12,fill:"#999999"})))):null}function k({options:t,value:n,onChange:r}){const{t:l}=(0,s.useTranslation)(),i=(0,d.useMemo)((()=>t.map((e=>({label:l(`exploreSortBy${e}`),key:e,onClick:()=>{r(e)}})))),[r,t,l]);return e(d).createElement(v,null,e(d).createElement(p.Dropdown,{items:i,dropdownWidth:h},e(d).createElement(C,{"data-testid":"exploreSortBy-button"},e(d).createElement(I,null,l(`exploreSortBy${n}`)),e(d).createElement(m.IconChevronDown,{width:12,height:12,fill:"#999999"}))))}const y=u.default.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  padding: 8px 16px 4px 16px;
`,v=u.default.div`
  margin-right: 4px;
`,S=u.default.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  justify-content: space-between;
  padding: 7px 0;
`,C=(0,u.default)(c.motion.div).attrs({activeOpacity:.6,whileHover:{background:"#3B3C40"},transition:{ease:[.5,1,.89,1],duration:.1},style:{background:"#2a2a2a"}})`
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-radius: 48px;
  display: flex;
  height: 32px;
  cursor: pointer;
`,I=u.default.div`
  margin-right: 6px;
  color: ${e=>e.theme.white};
  font-size: 15px;
  font-weight: 600;
`})),n.register("5oT4X",(function(r,l){t(r.exports,"ExploreFiltersSkeleton",(function(){return s}));var i=n("lDSNw"),a=n("cZIbv"),o=n("hjnIF");function s(){return e(i).createElement(c,null,e(i).createElement(d,{width:"99px",height:"26px"}),e(i).createElement(d,{width:"124px",height:"26px"}))}const c=a.default.div`
  display: flex;
  flex-direction: row;
  padding: 8px 16px 16px 16px;
`,d=(0,a.default)(o.SkeletonLoader)`
  background: ${e=>e.theme.skeletonLight};
  border-radius: 48px;
  margin-right: 4px;
`})),n.register("706Mc",(function(r,l){t(r.exports,"ExploreListCollections",(function(){return f}));var i=n("lMzyG"),a=n("lDSNw"),o=n("cZIbv"),s=n("gMNJN"),c=n("iacGS"),d=n("fgEo1"),u=n("60clc"),p=n("ekffL"),m=n("7zA4G"),x=n("awIgE");function f(){const{error:t,data:n}=s.hooks.useExploreCollections(),{isExploreLoading:r}=s.hooks.useIsExploreLoading(),{t:l}=(0,i.useTranslation)();return t&&!n?e(a).createElement(d.ExploreNetworkError,null):e(a).createElement(u.default,{items:n?n.data:[],renderItem:(t,r)=>e(a).createElement(g,{key:`carousel-card-collections-${r}`,href:t.marketplacePages[0].collectionUrl},e(a).createElement(m.ListItemContainer,{onPress:()=>{c.exploreAnalytics.onExploreListItemClickedByUser({datasourceId:(null==n?void 0:n.uuid)||"",listName:"collections",itemDetails:{position:r,title:t.name,id:t.id}})}},e(a).createElement(p.ListItemCollection,{collection:t,position:r+1}))),listName:"collections",header:e(a).createElement(x.ListHeader,{titles:["#",l("exploreFloor"),l("exploreVolume")]}),isLoading:r})}const g=o.default.a.attrs({target:"_blank",rel:"noopener noreferrer"})`
  text-decoration: none;
  display: contents;
`})),n.register("fgEo1",(function(r,l){t(r.exports,"ExploreNetworkError",(function(){return f}));var i=n("lDSNw"),a=n("bjaYq"),o=n("cZIbv"),s=n("aanFI"),c=n("6l2nq"),d=n("kn91D");const u=o.default.div`
  padding: 0 16px;
  margin-bottom: 16px;
`,p=o.default.div`
  padding: 16px;
  border-radius: 9px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background: #2a2a2a;
`,m=(0,o.default)(c.Row).attrs({align:"center",justify:"center"})`
  width: 24px;
  height: 24px;
`,x=(0,o.default)(d.Text).attrs({size:14,weight:400,lineHeight:21,marginLeft:8,color:"#EB3742"})``,f=()=>{const{t:t}=(0,a.useTranslation)();return e(i).createElement(u,{"data-testid":"explore-network-error"},e(i).createElement(p,null,e(i).createElement(m,null,e(i).createElement(s.IconExclamationMarkCircle,{width:18,exclamationFill:"transparent",circleFill:"#EB3742"})),e(i).createElement(x,null,t("exploreNetworkError"))))}})),n.register("60clc",(function(r,l){t(r.exports,"default",(function(){return d}));var i=n("7dqns"),a=n("c1thM"),o=n("lDSNw"),s=n("cZIbv"),c=n("h9SiU");function d({items:t,listName:n,renderItem:r,header:l,isLoading:a}){return e(o).createElement(u,{"data-testid":`explore-list-${n}`},l,e(o).createElement(i.AnimatePresence,null,a&&e(o).createElement(m,null,e(o).createElement(c.ListSkeleton,null))),!a&&t.map(((t,l)=>e(o).createElement(p,{key:`list-item-${n}-${l}`,"data-testid":`list-item-${n}-${l}`,whileHover:{background:"#333"},style:{background:"#222"},transition:{ease:[.5,1,.89,1],duration:.1}},r(t,l)))))}const u=s.default.div`
  flex-direction: column;
  width: 100%;
`,p=(0,s.default)(a.motion.div)`
  flex: 1;
  width: 100%;
  cursor: pointer;
`,m=(0,s.default)(a.motion.div).attrs({initial:{opacity:1},animate:{opacity:1},exit:{opacity:0},transition:{duration:.2,ease:"easeInOut"}})``})),n.register("h9SiU",(function(r,l){t(r.exports,"ListSkeleton",(function(){return s}));var i=n("lDSNw"),a=n("cZIbv"),o=n("hjnIF");function s({items:t=10}){const n=(0,i.useMemo)((()=>{const e=[];for(let n=0;n<t;n++)e.push(n);return e}),[t]);return e(i).createElement(d,{"data-testid":"explore-list-skeleton"},n.map(((t,n)=>e(i).createElement(c,{key:t,index:n+1}))))}function c({index:t}){return e(i).createElement(u,null,e(i).createElement(p,null,e(i).createElement(x,null,e(i).createElement(f,null,t)),e(i).createElement(g,null),e(i).createElement("div",null,e(i).createElement(o.SkeletonLoader,{width:"95px",height:"20px",marginBottom:"4px",borderRadius:"16px"}),e(i).createElement(o.SkeletonLoader,{width:"69px",height:"20px",borderRadius:"16px"}))),e(i).createElement(m,null,e(i).createElement(o.SkeletonLoader,{width:"69px",height:"20px",marginBottom:"4px",borderRadius:"16px"}),e(i).createElement(o.SkeletonLoader,{width:"38px",height:"20px",borderRadius:"16px"})))}const d=a.default.div`
  padding: 0 16px;
  flex-direction: column;
  width: 100%;
`,u=a.default.div`
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: space-between;
  gap: 10px;
  display: flex;
  padding: 12px 0;
`,p=a.default.div`
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  display: flex;
`,m=a.default.div`
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  text-align: right;
`,x=a.default.div`
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
`,f=a.default.div`
  font-size: 14px;
  line-height: 18px;
  color: #777777;
`,g=(0,a.default)(o.SkeletonLoader)`
  background: ${e=>e.theme.skeletonLight};
  border-radius: 14px;
  height: 48px;
  width: 48px;
`})),n.register("ekffL",(function(r,l){t(r.exports,"ListItemCollection",(function(){return p}));var i=n("4y59b"),a=n("3yHS8"),o=n("lDSNw"),s=n("gmVmN"),c=n("cZIbv"),d=n("c6Gae"),u=n("hjnIF");const p=({collection:t,position:n})=>{const r=(0,o.useMemo)((()=>{const n=new(e(a))(t.floorPrices[0].value,10).dividedBy(new(e(a))(10).pow(t.floorPrices[0].paymentToken.decimals)).toNumber();return`${(0,s.formatNumber)(n)} ${t.floorPrices[0].paymentToken.symbol} `}),[t.floorPrices]),l=(0,o.useMemo)((()=>{const n=new(e(a))(t.volume||0,10).dividedBy(new(e(a))(10).pow(t.floorPrices[0].paymentToken.decimals)).toNumber();return`${(0,s.formatNumber)(n,{compact:n>=1e3})} ${t.floorPrices[0].paymentToken.symbol}`}),[t.volume,t.floorPrices]);return e(o).createElement(m,null,e(o).createElement(x,null,e(o).createElement(g,null,e(o).createElement(h,null,n)),e(o).createElement(y,{src:t.imageUrl,width:48,height:48,fallback:e(o).createElement(u.SkeletonLoader,{borderRadius:"14px",width:"48px",height:"48px"}),loader:e(o).createElement(u.SkeletonLoader,{borderRadius:"14px",width:"48px",height:"48px"})}),e(o).createElement("div",null,e(o).createElement(E,null,(0,i.truncateString)(t.name,15)),e(o).createElement(b,null,r))),e(o).createElement(f,null,e(o).createElement(w,null,l),e(o).createElement(k,{green:t.volumePercentChange>=0},(0,s.formatNumber)(t.volumePercentChange,{compact:!0,includePlusPrefix:!0}),"%")))},m=c.default.div`
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: space-between;
  gap: 10px;
  display: flex;
`,x=c.default.div`
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  display: flex;
`,f=c.default.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  text-align: right;
`,g=c.default.div`
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
`,h=c.default.div`
  font-size: 14px;
  line-height: 18px;
  color: #777777;
  font-weight: 600;
`,E=c.default.div`
  font-size: 17px;
  line-height: 22px;
  height: 22px;
  overflow-x: hidden;
`,b=c.default.div`
  font-size: 15px;
  line-height: 20px;
  color: ${e=>e.theme.grayLight};
`,w=c.default.div`
  font-size: 17px;
  line-height: 22px;
  white-space: nowrap;
`,k=c.default.div`
  font-size: 15px;
  line-height: 20px;
  color: ${e=>e.green?e.theme.green:e.theme.alert};
  text-align: right;
`,y=(0,c.default)(d.PImage)`
  border-radius: 14px;
  width: 48px;
  height: 48px;
`})),n.register("7zA4G",(function(r,l){t(r.exports,"ListItemContainer",(function(){return a}));var i=n("lDSNw");function a({children:t,onPress:n}){return e(i).createElement(o,{onClick:n},t)}const o=n("cZIbv").default.div`
  width: 100%;
  padding: 12px 16px;
`})),n.register("awIgE",(function(r,l){t(r.exports,"ListHeader",(function(){return o}));var i=n("lDSNw"),a=n("cZIbv");const o=({titles:t})=>e(i).createElement(s,null,e(i).createElement(c,null,e(i).createElement(p,null,e(i).createElement(u,null,t[0])),e(i).createElement(u,null,t[1])),e(i).createElement(d,null,e(i).createElement(u,null,t[2]))),s=a.default.div`
  flex-direction: row;
  width: 100%;
  justify-content: space-between;
  display: flex;
  padding-left: 16px;
  padding-right: 16px;
  padding-bottom: 4px;
  padding-top: 12px;
`,c=a.default.div`
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  display: flex;
`,d=a.default.div`
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  display: flex;
`,u=a.default.div`
  font-size: 14px;
  line-height: 18px;
  font-weight: 600;
  color: ${e=>e.theme.grayLight};
`,p=a.default.div`
  width: 74px;
  padding-left: 4px;
`})),n.register("28cqA",(function(r,l){t(r.exports,"ExploreTabSites",(function(){return u}));var i=n("lDSNw"),a=n("gMNJN"),o=n("iBj6N"),s=n("hTknS"),c=n("5oT4X"),d=n("dA6Zr");const u=()=>{const{isPreviousData:t}=a.hooks.useExploreSites(),{isExploreLoading:n}=a.hooks.useIsExploreLoading();return e(i).createElement("div",null,e(i).createElement(o.CarouselSites,null),n&&!t?e(i).createElement(c.ExploreFiltersSkeleton,null):e(i).createElement(s.default,{tab:"sites"}),e(i).createElement(d.ExploreListSites,null))}})),n.register("iBj6N",(function(r,l){t(r.exports,"CarouselSites",(function(){return m}));var i=n("4y59b"),a=n("lDSNw"),o=n("cZIbv"),s=n("gMNJN"),c=n("iacGS"),d=n("h868b"),u=n("ifWd7"),p=n("i68Tg");function m(){var t;const{error:n,data:r}=s.hooks.useExploreRecommendedSites(),{isExploreLoading:l}=s.hooks.useIsExploreLoading(),o=(0,a.useCallback)(((t,n)=>e(a).createElement(x,{key:`carousel-card-sites-${n}`,href:(0,i.formatSearchURI)(t.url)},e(a).createElement(u.CarouselCardContainer,{onPress:()=>{c.exploreAnalytics.onExploreCarouselItemClickedByUser({datasourceId:(null==r?void 0:r.uuid)||"",carouselName:"sites",itemDetails:{position:n,title:t.name,id:t.id}})}},e(a).createElement(p.CarouselCardSite,{site:t})))),[null==r?void 0:r.uuid]);return e(a).createElement(d.default,{name:"sites",items:r?r.data:[],renderCard:o,isLoading:l,isEmpty:!(!n||(null==r?void 0:r.data)&&0!==(null===(t=null==r?void 0:r.data)||void 0===t?void 0:t.length))})}const x=o.default.a.attrs({target:"_blank",rel:"noopener noreferrer"})`
  text-decoration: none;
  display: contents;
`})),n.register("i68Tg",(function(r,l){t(r.exports,"CarouselCardSite",(function(){return d}));var i=n("lMzyG"),a=n("lDSNw"),o=n("cZIbv"),s=n("c6Gae"),c=n("ctrIg");const d=({site:t})=>{const{t:n}=(0,i.useTranslation)();return e(a).createElement(c.CarouselBackgroundImageCard,{src:t.backgroundImageUrl},e(a).createElement(u,null,e(a).createElement(x,null,e(a).createElement(p,null,t.name),e(a).createElement(m,null,n(`exploreCategory${t.category}`))),e(a).createElement(f,null,e(a).createElement(g,{src:t.imageUrl}))))},u=o.default.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding: 6px 12px 8px 12px;
`,p=o.default.div`
  font-weight: 600;
  font-size: 18px;
  line-height: 22px;
  width: 100%;
  white-space: nowrap;
  -webkit-mask-image: linear-gradient(91deg, black 85%, transparent);
`,m=o.default.div`
  color: ${e=>e.theme.grayLight};
  font-size: 14px;
  font-weight: 600;
  line-height: 18px;
`,x=o.default.div`
  flex: 1;
  width: 100%;
  overflow-x: hidden;
`,f=o.default.div`
  transform: translateY(-12px);
`,g=(0,o.default)(s.PImage)`
  width: 48px;
  height: 48px;
  border-radius: 14px;
`})),n.register("dA6Zr",(function(r,l){t(r.exports,"ExploreListSites",(function(){return x}));var i=n("4y59b"),a=n("lDSNw"),o=n("cZIbv"),s=n("gMNJN"),c=n("iacGS"),d=n("fgEo1"),u=n("60clc"),p=n("7zA4G"),m=n("7Kfe9");function x(){const{error:t,data:n}=s.hooks.useExploreSites(),{isExploreLoading:r}=s.hooks.useIsExploreLoading();return t&&!n?e(a).createElement(d.ExploreNetworkError,null):e(a).createElement(u.default,{items:n?n.data:[],renderItem:(t,r)=>e(a).createElement(f,{key:`carousel-card-sites-${r}`,href:(0,i.formatSearchURI)(t.url)},e(a).createElement(p.ListItemContainer,{onPress:()=>{c.exploreAnalytics.onExploreListItemClickedByUser({datasourceId:(null==n?void 0:n.uuid)||"",listName:"sites",itemDetails:{position:r,title:t.name,id:t.id}})}},e(a).createElement(m.ListItemSite,{site:t,position:r+1}))),listName:"sites",isLoading:r,header:null})}const f=o.default.a.attrs({target:"_blank",rel:"noopener noreferrer"})`
  text-decoration: none;
  display: contents;
`})),n.register("7Kfe9",(function(r,l){t(r.exports,"ListItemSite",(function(){return u}));var i=n("lMzyG"),a=n("4y59b"),o=n("lDSNw"),s=n("cZIbv"),c=n("c6Gae"),d=n("hjnIF");const u=({site:t,position:n})=>{const{t:r}=(0,i.useTranslation)();return e(o).createElement(p,null,e(o).createElement(m,null,e(o).createElement(x,null,n)),e(o).createElement(h,{src:t.imageUrl,width:48,height:48,fallback:e(o).createElement(d.SkeletonLoader,{borderRadius:"14px",width:"48px",height:"48px"}),loader:e(o).createElement(d.SkeletonLoader,{borderRadius:"14px",width:"48px",height:"48px"})}),e(o).createElement("div",null,e(o).createElement(f,null,(0,a.truncateString)(t.name,15)),e(o).createElement(g,null,r(`exploreCategory${t.category}`))))},p=s.default.div`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 10px;
  display: flex;
  align-items: center;
`,m=s.default.div`
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
`,x=s.default.div`
  font-size: 14px;
  line-height: 18px;
  color: #777777;
  font-weight: 600;
`,f=s.default.div`
  font-size: 17px;
  line-height: 22px;
`,g=s.default.div`
  font-size: 15px;
  line-height: 20px;
  color: ${e=>e.theme.grayLight};
`,h=(0,s.default)(c.PImage)`
  border-radius: 14px;
  width: 48px;
  height: 48px;
`})),n.register("1sMuZ",(function(r,l){t(r.exports,"ExploreTabTokens",(function(){return u}));var i=n("lDSNw"),a=n("gMNJN"),o=n("9yEL6"),s=n("hTknS"),c=n("5oT4X"),d=n("gt4Z2");const u=()=>{const{isPreviousData:t}=a.hooks.useExploreTokens(),{currentSortOption:n}=a.hooks.useExploreSortOption(),{isExploreLoading:r}=a.hooks.useIsExploreLoading(),l=n("tokens");return e(i).createElement("div",null,e(i).createElement(o.CarouselTokens,null),r&&!t?e(i).createElement(c.ExploreFiltersSkeleton,null):e(i).createElement(s.default,{tab:"tokens"}),e(i).createElement(d.ExploreListTokens,{displayType:l}))}})),n.register("9yEL6",(function(r,l){t(r.exports,"CarouselTokens",(function(){return m}));var i=n("54qyi"),a=n("lDSNw"),o=n("gMNJN"),s=n("iacGS"),c=n("lKTPx"),d=n("h868b"),u=n("ifWd7"),p=n("j8AfH");function m(){var t;const{error:n,data:r}=o.hooks.useExploreRecommendedTokens(),{isExploreLoading:l}=o.hooks.useIsExploreLoading(),m=(0,c.useNavigateToSwapper)(),{data:x}=o.hooks.useSelectedMultiChainAccount(),f=null==x?void 0:x.isReadOnly,g=(0,a.useCallback)(((t,n)=>e(a).createElement(u.CarouselCardContainer,{key:`carousel-card-token-${n}`,onPress:()=>{(0,i.shouldNavigateToSwapper)(f,t)&&(m({buyFungible:t.tokens[0]}),s.exploreAnalytics.onExploreCarouselItemClickedByUser({datasourceId:(null==r?void 0:r.uuid)||"",carouselName:"tokens",itemDetails:{position:n,title:t.tokens[0].data.name||t.id,id:t.id||""}}))}},e(a).createElement(p.CarouselCardToken,{token:t}))),[null==r?void 0:r.uuid,m,f]);return e(a).createElement(d.default,{name:"tokens",items:r?r.data:[],renderCard:g,isLoading:l,isEmpty:!(!n||(null==r?void 0:r.data)&&0!==(null===(t=null==r?void 0:r.data)||void 0===t?void 0:t.length))})}})),n.register("lKTPx",(function(e,r){t(e.exports,"useNavigateToSwapper",(function(){return d}));var l=n("belzv"),i=n("gYh0e"),a=n("lDSNw"),o=n("lz7nT"),s=n("8182A");const c=e=>{const t=(0,i.getFungibleCaip19FromFungible)(e);return(0,l.encodeCaip19)(t)},d=()=>{const e=(0,o.useNavigate)();return(0,a.useCallback)((({sellFungible:t,buyFungible:n,sellAmount:r})=>{const l=new URLSearchParams;t&&l.append("sellFungible",c(t)),n&&l.append("buyFungible",c(n)),r&&l.append("sellAmount",r),e(`${s.Path.Swap}?${l.toString()}`)}),[e])}})),n.register("j8AfH",(function(r,l){t(r.exports,"CarouselCardToken",(function(){return u}));var i=n("4y59b"),a=n("lDSNw"),o=n("gmVmN"),s=n("cZIbv"),c=n("c6Gae"),d=n("1GaZ5");const u=({token:t})=>{const n=t.tokens[0];return e(a).createElement(p,null,e(a).createElement(m,null,e(a).createElement(x,null,e(a).createElement(f,null,(0,i.truncateString)(n.data.name||"",12)),e(a).createElement(g,null,n.data.symbol)),e(a).createElement(h,{src:n.data.logoUri||""})),e(a).createElement(E,null,e(a).createElement(b,null,(0,o.formatDollarAmount)(parseFloat(t.currentPrice),{minimumAmount:1e-6,decimalFormatSmallNumbers:"0.[000000]",roundDecimals:!0})),e(a).createElement(w,{green:parseFloat(t.priceChangePercentage)>=0},(0,o.formatNumber)(parseFloat(t.priceChangePercentage),{includePlusPrefix:!0,suffix:"%"}))))},p=s.default.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: ${d.EXPLORE_CARD_SIZE_PX};
  width: ${d.EXPLORE_CARD_SIZE_PX};
  padding: 10px 12px;
  background-color: #2c2d30;
  border-radius: 16px;
`,m=s.default.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
`,x=s.default.div`
  height: 36px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 3px;
`,f=s.default.div`
  font-size: 14px;
  font-style: normal;
  font-weight: 400;
  line-height: normal;
`,g=s.default.div`
  color: ${e=>e.theme.grayLight};
  font-size: 13px;
  font-style: normal;
  font-weight: 500;
  line-height: normal;
`,h=(0,s.default)(c.PImage)`
  width: 32px;
  height: 32px;
  border-radius: 100px;
`,E=s.default.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
`,b=s.default.div`
  font-size: 22px;
  font-style: normal;
  font-weight: 500;
  line-height: 24px;
  letter-spacing: -0.44px;
`,w=s.default.div`
  font-size: 13px;
  font-style: normal;
  font-weight: 500;
  line-height: normal;
  color: ${e=>e.green?e.theme.green:e.theme.alert};
`})),n.register("gt4Z2",(function(r,l){t(r.exports,"ExploreListTokens",(function(){return h}));var i=n("54qyi"),a=n("lMzyG"),o=n("lDSNw"),s=n("cZIbv"),c=n("gMNJN"),d=n("iacGS"),u=n("lKTPx"),p=n("fgEo1"),m=n("60clc"),x=n("7zA4G"),f=n("41PSP"),g=n("awIgE");function h({displayType:t}){const{error:n,data:r}=c.hooks.useExploreTokens(),{isExploreLoading:l}=c.hooks.useIsExploreLoading(),{data:s}=c.hooks.useExploreSelectedNetwork(),{t:h}=(0,a.useTranslation)(),{data:b}=c.hooks.useSelectedMultiChainAccount(),w=null==b?void 0:b.isReadOnly,k=(0,u.useNavigateToSwapper)(),y=(0,o.useMemo)((()=>{switch(t){case"market_cap":return["#",h("exploreToken"),h("exploreCap")];case"gainers":case"losers":return["#",h("exploreToken"),h("explorePrice")];default:return["#",h("exploreToken"),h("explore24hVolume")]}}),[t,h]);return n&&!r?e(o).createElement(p.ExploreNetworkError,null):e(o).createElement(m.default,{items:r?r.data:[],renderItem:(n,l)=>e(o).createElement(x.ListItemContainer,{key:`carousel-card-tokens-${l}`,onPress:()=>{var e;if((0,i.shouldNavigateToSwapper)(w,n)){const t=null!==(e=n.tokens.find((e=>e.data.chain.id===s)))&&void 0!==e?e:n.tokens[0];k({buyFungible:t}),d.exploreAnalytics.onExploreListItemClickedByUser({datasourceId:(null==r?void 0:r.uuid)||"",listName:"tokens",itemDetails:{position:l,title:t.data.name||n.id,id:n.id}})}}},e(o).createElement(E,null,e(o).createElement(f.ListItemToken,{token:n,position:l+1,displayType:t}))),listName:"tokens",isLoading:l,header:e(o).createElement(g.ListHeader,{titles:y})})}const E=s.default.div`
  cursor: pointer;
`})),n.register("41PSP",(function(r,l){t(r.exports,"ListItemToken",(function(){return u}));var i=n("4y59b"),a=n("lDSNw"),o=n("gmVmN"),s=n("cZIbv"),c=n("c6Gae"),d=n("hjnIF");const u=({token:t,position:n,displayType:r})=>{const l=t.tokens[0],s=(0,a.useMemo)((()=>{switch(r){case"market_cap":return e(a).createElement(e(a).Fragment,null,e(a).createElement(w,null,(0,o.formatDollarAmount)(parseFloat(t.marketCap)||0,{compact:!0})),e(a).createElement(k,{green:parseFloat(t.marketCapChangePercentage)>=0},(0,o.formatNumber)(parseFloat(t.marketCapChangePercentage),{includePlusPrefix:!0,suffix:"%",compact:!0})));case"volume":return e(a).createElement(e(a).Fragment,null,e(a).createElement(w,null,(0,o.formatDollarAmount)(parseFloat(t.volume)||0,{compact:!0})));default:return e(a).createElement(e(a).Fragment,null,e(a).createElement(w,null,(0,o.formatDollarAmount)(parseFloat(t.currentPrice),{minimumAmount:1e-6,decimalFormatSmallNumbers:"0.[000000]",roundDecimals:!0})),e(a).createElement(k,{green:parseFloat(t.priceChangePercentage)>=0},(0,o.formatNumber)(parseFloat(t.priceChangePercentage),{includePlusPrefix:!0,suffix:"%",compact:!0})))}}),[r,t]);return e(a).createElement(p,null,e(a).createElement(m,null,e(a).createElement(g,null,e(a).createElement(h,null,n)),e(a).createElement(y,{src:l.data.logoUri||"",width:48,height:48,fallback:e(a).createElement(S,null,e(a).createElement(v,null,l.data.symbol)),loader:e(a).createElement(d.SkeletonLoader,{borderRadius:"14px",width:"48px",height:"48px"})}),e(a).createElement(x,null,e(a).createElement(E,null,(0,i.truncateString)(l.data.name||"",15)),e(a).createElement(b,null,l.data.symbol))),e(a).createElement(f,null,s))},p=s.default.div`
  flex-direction: row;
  flex-wrap: no-wrap;
  justify-content: space-between;
  gap: 10px;
  display: flex;
`,m=s.default.div`
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  display: flex;
  overflow: hidden;
`,x=s.default.div`
  overflow: hidden;
`,f=s.default.div`
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  display: flex;
  flex: 1;
`,g=s.default.div`
  width: 18px;
  min-width: 18px;
  height: 18px;
  min-height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
`,h=s.default.div`
  font-size: 14px;
  line-height: 18px;
  color: #777777;
  font-weight: 600;
`,E=s.default.div`
  font-size: 17px;
  line-height: 22px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,b=s.default.div`
  font-size: 15px;
  line-height: 20px;
  color: ${e=>e.theme.grayLight};
`,w=s.default.div`
  font-size: 17px;
  line-height: 22px;
`,k=s.default.div`
  font-size: 15px;
  line-height: 20px;
  color: ${e=>e.green?e.theme.green:e.theme.alert};
`,y=(0,s.default)(c.PImage)`
  width: 48px;
  height: 48px;
  border-radius: 100px;
`,v=s.default.div.attrs({numberOfLines:1})`
  color: ${e=>e.theme.white};
  font-size: 12px;
`,S=s.default.div`
  width: 48px;
  min-width: 48px;
  height: 48px;
  min-height: 48px;
  border-radius: 100px;
  background-color: ${e=>e.theme.buttonGray};
  display: flex;
  align-items: center;
  justify-content: center;
`})),n.register("lAgRD",(function(r,l){t(r.exports,"ExploreTabsTitles",(function(){return u}));var i=n("54qyi"),a=n("lDSNw"),o=n("bjaYq"),s=n("iacGS"),c=n("86rg0"),d=n("YBIrC");const u=()=>{const{activeSectionIdx:t,sections:n}=(0,c.useExploreSections)(),{setActiveSection:r}=(0,i.useExplore)(),{t:l}=(0,o.useTranslation)(),u=(0,a.useMemo)((()=>n.map((e=>{switch(e){case"sites":return l("exploreApps");case"tokens":return l("exploreTokens");case"collections":return l("exploreCollections");case"quests":return l("quests");case"learn":return l("exploreLearn");default:return""}}))),[n,l]);return e(a).createElement(d.default,{values:u,activeTabIndex:t,setActiveTabIndex:e=>{const t=n[e];r(t),s.exploreAnalytics.onExploreTabClickedByUser({tabName:t})}})}})),n.register("YBIrC",(function(r,l){t(r.exports,"default",(function(){return m}));var i=n("bK93X"),a=n("c1thM"),o=n("1bdlq"),s=n("lDSNw"),c=n("cZIbv"),d=n("iacGS");const u=16,p={duration:.3,delay:0,ease:"easeOut"};function m({values:t,activeTabIndex:n,setActiveTabIndex:r}){const l=(0,s.useRef)(null),[a,c]=(0,s.useState)(null),[m,E]=(0,s.useState)(0);(0,s.useEffect)((()=>{l.current&&E(l.current.scrollWidth)}),[t]);const b=(0,o.useMotionValue)(0),w=(0,s.useMemo)((()=>{const e=window.innerWidth-m-u;return Math.min(0,e)}),[m]),k=(0,s.useCallback)(((e,t)=>{const{left:n,right:r}=e.getBoundingClientRect(),l=r>window.innerWidth-u;if(l||n<u){const e=void 0!==t?t:l?w:0;return(0,i.animate)(b,e,p)}}),[b,w]);return e(s).createElement(x,{ref:l},e(s).createElement(f,{drag:"x",style:{x:b},dragConstraints:{left:w,right:0},onDragStart:()=>{c(b.get())},onDragEnd:()=>{c(null),d.exploreAnalytics.onExploreTabTitlesDragged()},onWheel:e=>{if(0===e.deltaX)return;const t=b.get()-e.deltaX;return t>0?b.set(0):t<w?b.set(w):b.set(t)}},t.map(((t,l)=>{const i=n===l;return e(s).createElement(g,{"data-testid":`tab-title-${t}`,key:`tab-title-${l}`,active:n===l},e(s).createElement(h,{onClick:e=>{if(null!==a)return e.stopPropagation(),void e.preventDefault();r(l),k(e.currentTarget)},isActive:i},t))}))))}const x=c.default.div`
  border-bottom: 1px solid ${e=>e.theme.border};
`,f=(0,c.default)(a.motion.div)`
  display: flex;
  flex-direction: row;
  padding: 0 16px;
`,g=c.default.div`
  border-bottom-style: solid;
  border-bottom-width: ${e=>e.active?"2px":0};
  border-bottom-color: ${e=>e.active?e.theme.purple:e.theme.border};
  margin-right: 8px;
  height: 56px;
  display: flex;
  align-items: center;
`,h=c.default.div`
  padding: 8px 4px;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  color: ${e=>e.isActive?e.theme.white:e.theme.grayLight};
  transition:
    color 0.1s cubic-bezier(0.5, 1, 0.89, 1),
    background 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;

  height: 32px;
  display: flex;
  align-items: center;

  &:active {
    color: ${e=>e.theme.white};
    background: #333;
  }
`}));
//# sourceMappingURL=ExplorePage.4e464988.js.map
define=__define;})(window.define);