"use strict";(()=>{var Y0=Object.create;var Yc=Object.defineProperty;var K0=Object.getOwnPropertyDescriptor;var Z0=Object.getOwnPropertyNames;var J0=Object.getPrototypeOf,W0=Object.prototype.hasOwnProperty;var Lt=(e,t)=>()=>(t||e((t={exports:{}}).exports,t),t.exports),Dh=(e,t)=>{for(var a in t)Yc(e,a,{get:t[a],enumerable:!0})},$0=(e,t,a,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let l of Z0(t))!W0.call(e,l)&&l!==a&&Yc(e,l,{get:()=>t[l],enumerable:!(n=K0(t,l))||n.enumerable});return e};var J=(e,t,a)=>(a=e!=null?Y0(J0(e)):{},$0(t||!e||!e.__esModule?Yc(a,"default",{value:e,enumerable:!0}):a,e));var Fh=Lt(ae=>{"use strict";var Jc=Symbol.for("react.transitional.element"),eC=Symbol.for("react.portal"),tC=Symbol.for("react.fragment"),aC=Symbol.for("react.strict_mode"),nC=Symbol.for("react.profiler"),lC=Symbol.for("react.consumer"),rC=Symbol.for("react.context"),oC=Symbol.for("react.forward_ref"),iC=Symbol.for("react.suspense"),uC=Symbol.for("react.memo"),Rh=Symbol.for("react.lazy"),sC=Symbol.for("react.activity"),Mh=Symbol.iterator;function cC(e){return e===null||typeof e!="object"?null:(e=Mh&&e[Mh]||e["@@iterator"],typeof e=="function"?e:null)}var Oh={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},Nh=Object.assign,qh={};function cr(e,t,a){this.props=e,this.context=t,this.refs=qh,this.updater=a||Oh}cr.prototype.isReactComponent={};cr.prototype.setState=function(e,t){if(typeof e!="object"&&typeof e!="function"&&e!=null)throw Error("takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")};cr.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")};function Uh(){}Uh.prototype=cr.prototype;function Wc(e,t,a){this.props=e,this.context=t,this.refs=qh,this.updater=a||Oh}var $c=Wc.prototype=new Uh;$c.constructor=Wc;Nh($c,cr.prototype);$c.isPureReactComponent=!0;var Eh=Array.isArray;function Zc(){}var Ae={H:null,A:null,T:null,S:null},Ph=Object.prototype.hasOwnProperty;function ef(e,t,a){var n=a.ref;return{$$typeof:Jc,type:e,key:t,ref:n!==void 0?n:null,props:a}}function fC(e,t){return ef(e.type,t,e.props)}function tf(e){return typeof e=="object"&&e!==null&&e.$$typeof===Jc}function dC(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,function(a){return t[a]})}var zh=/\/+/g;function Kc(e,t){return typeof e=="object"&&e!==null&&e.key!=null?dC(""+e.key):t.toString(36)}function pC(e){switch(e.status){case"fulfilled":return e.value;case"rejected":throw e.reason;default:switch(typeof e.status=="string"?e.then(Zc,Zc):(e.status="pending",e.then(function(t){e.status==="pending"&&(e.status="fulfilled",e.value=t)},function(t){e.status==="pending"&&(e.status="rejected",e.reason=t)})),e.status){case"fulfilled":return e.value;case"rejected":throw e.reason}}throw e}function sr(e,t,a,n,l){var r=typeof e;(r==="undefined"||r==="boolean")&&(e=null);var o=!1;if(e===null)o=!0;else switch(r){case"bigint":case"string":case"number":o=!0;break;case"object":switch(e.$$typeof){case Jc:case eC:o=!0;break;case Rh:return o=e._init,sr(o(e._payload),t,a,n,l)}}if(o)return l=l(e),o=n===""?"."+Kc(e,0):n,Eh(l)?(a="",o!=null&&(a=o.replace(zh,"$&/")+"/"),sr(l,t,a,"",function(c){return c})):l!=null&&(tf(l)&&(l=fC(l,a+(l.key==null||e&&e.key===l.key?"":(""+l.key).replace(zh,"$&/")+"/")+o)),t.push(l)),1;o=0;var i=n===""?".":n+":";if(Eh(e))for(var u=0;u<e.length;u++)n=e[u],r=i+Kc(n,u),o+=sr(n,t,a,r,l);else if(u=cC(e),typeof u=="function")for(e=u.call(e),u=0;!(n=e.next()).done;)n=n.value,r=i+Kc(n,u++),o+=sr(n,t,a,r,l);else if(r==="object"){if(typeof e.then=="function")return sr(pC(e),t,a,n,l);throw t=String(e),Error("Objects are not valid as a React child (found: "+(t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.")}return o}function pu(e,t,a){if(e==null)return e;var n=[],l=0;return sr(e,n,"","",function(r){return t.call(a,r,l++)}),n}function mC(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(a){(e._status===0||e._status===-1)&&(e._status=1,e._result=a)},function(a){(e._status===0||e._status===-1)&&(e._status=2,e._result=a)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var Bh=typeof reportError=="function"?reportError:function(e){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof e=="object"&&e!==null&&typeof e.message=="string"?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",e);return}console.error(e)},hC={map:pu,forEach:function(e,t,a){pu(e,function(){t.apply(this,arguments)},a)},count:function(e){var t=0;return pu(e,function(){t++}),t},toArray:function(e){return pu(e,function(t){return t})||[]},only:function(e){if(!tf(e))throw Error("React.Children.only expected to receive a single React element child.");return e}};ae.Activity=sC;ae.Children=hC;ae.Component=cr;ae.Fragment=tC;ae.Profiler=nC;ae.PureComponent=Wc;ae.StrictMode=aC;ae.Suspense=iC;ae.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=Ae;ae.__COMPILER_RUNTIME={__proto__:null,c:function(e){return Ae.H.useMemoCache(e)}};ae.cache=function(e){return function(){return e.apply(null,arguments)}};ae.cacheSignal=function(){return null};ae.cloneElement=function(e,t,a){if(e==null)throw Error("The argument must be a React element, but you passed "+e+".");var n=Nh({},e.props),l=e.key;if(t!=null)for(r in t.key!==void 0&&(l=""+t.key),t)!Ph.call(t,r)||r==="key"||r==="__self"||r==="__source"||r==="ref"&&t.ref===void 0||(n[r]=t[r]);var r=arguments.length-2;if(r===1)n.children=a;else if(1<r){for(var o=Array(r),i=0;i<r;i++)o[i]=arguments[i+2];n.children=o}return ef(e.type,l,n)};ae.createContext=function(e){return e={$$typeof:rC,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null},e.Provider=e,e.Consumer={$$typeof:lC,_context:e},e};ae.createElement=function(e,t,a){var n,l={},r=null;if(t!=null)for(n in t.key!==void 0&&(r=""+t.key),t)Ph.call(t,n)&&n!=="key"&&n!=="__self"&&n!=="__source"&&(l[n]=t[n]);var o=arguments.length-2;if(o===1)l.children=a;else if(1<o){for(var i=Array(o),u=0;u<o;u++)i[u]=arguments[u+2];l.children=i}if(e&&e.defaultProps)for(n in o=e.defaultProps,o)l[n]===void 0&&(l[n]=o[n]);return ef(e,r,l)};ae.createRef=function(){return{current:null}};ae.forwardRef=function(e){return{$$typeof:oC,render:e}};ae.isValidElement=tf;ae.lazy=function(e){return{$$typeof:Rh,_payload:{_status:-1,_result:e},_init:mC}};ae.memo=function(e,t){return{$$typeof:uC,type:e,compare:t===void 0?null:t}};ae.startTransition=function(e){var t=Ae.T,a={};Ae.T=a;try{var n=e(),l=Ae.S;l!==null&&l(a,n),typeof n=="object"&&n!==null&&typeof n.then=="function"&&n.then(Zc,Bh)}catch(r){Bh(r)}finally{t!==null&&a.types!==null&&(t.types=a.types),Ae.T=t}};ae.unstable_useCacheRefresh=function(){return Ae.H.useCacheRefresh()};ae.use=function(e){return Ae.H.use(e)};ae.useActionState=function(e,t,a){return Ae.H.useActionState(e,t,a)};ae.useCallback=function(e,t){return Ae.H.useCallback(e,t)};ae.useContext=function(e){return Ae.H.useContext(e)};ae.useDebugValue=function(){};ae.useDeferredValue=function(e,t){return Ae.H.useDeferredValue(e,t)};ae.useEffect=function(e,t){return Ae.H.useEffect(e,t)};ae.useEffectEvent=function(e){return Ae.H.useEffectEvent(e)};ae.useId=function(){return Ae.H.useId()};ae.useImperativeHandle=function(e,t,a){return Ae.H.useImperativeHandle(e,t,a)};ae.useInsertionEffect=function(e,t){return Ae.H.useInsertionEffect(e,t)};ae.useLayoutEffect=function(e,t){return Ae.H.useLayoutEffect(e,t)};ae.useMemo=function(e,t){return Ae.H.useMemo(e,t)};ae.useOptimistic=function(e,t){return Ae.H.useOptimistic(e,t)};ae.useReducer=function(e,t,a){return Ae.H.useReducer(e,t,a)};ae.useRef=function(e){return Ae.H.useRef(e)};ae.useState=function(e){return Ae.H.useState(e)};ae.useSyncExternalStore=function(e,t,a){return Ae.H.useSyncExternalStore(e,t,a)};ae.useTransition=function(){return Ae.H.useTransition()};ae.version="19.2.3"});var je=Lt((tM,Hh)=>{"use strict";Hh.exports=Fh()});var Jh=Lt(ze=>{"use strict";function rf(e,t){var a=e.length;e.push(t);e:for(;0<a;){var n=a-1>>>1,l=e[n];if(0<mu(l,t))e[n]=t,e[a]=l,a=n;else break e}}function wa(e){return e.length===0?null:e[0]}function gu(e){if(e.length===0)return null;var t=e[0],a=e.pop();if(a!==t){e[0]=a;e:for(var n=0,l=e.length,r=l>>>1;n<r;){var o=2*(n+1)-1,i=e[o],u=o+1,c=e[u];if(0>mu(i,a))u<l&&0>mu(c,i)?(e[n]=c,e[u]=a,n=u):(e[n]=i,e[o]=a,n=o);else if(u<l&&0>mu(c,a))e[n]=c,e[u]=a,n=u;else break e}}return t}function mu(e,t){var a=e.sortIndex-t.sortIndex;return a!==0?a:e.id-t.id}ze.unstable_now=void 0;typeof performance=="object"&&typeof performance.now=="function"?(_h=performance,ze.unstable_now=function(){return _h.now()}):(af=Date,Gh=af.now(),ze.unstable_now=function(){return af.now()-Gh});var _h,af,Gh,ja=[],Sn=[],gC=1,Wt=null,mt=3,of=!1,vo=!1,Co=!1,uf=!1,Xh=typeof setTimeout=="function"?setTimeout:null,Qh=typeof clearTimeout=="function"?clearTimeout:null,Vh=typeof setImmediate<"u"?setImmediate:null;function hu(e){for(var t=wa(Sn);t!==null;){if(t.callback===null)gu(Sn);else if(t.startTime<=e)gu(Sn),t.sortIndex=t.expirationTime,rf(ja,t);else break;t=wa(Sn)}}function sf(e){if(Co=!1,hu(e),!vo)if(wa(ja)!==null)vo=!0,dr||(dr=!0,fr());else{var t=wa(Sn);t!==null&&cf(sf,t.startTime-e)}}var dr=!1,So=-1,Yh=5,Kh=-1;function Zh(){return uf?!0:!(ze.unstable_now()-Kh<Yh)}function nf(){if(uf=!1,dr){var e=ze.unstable_now();Kh=e;var t=!0;try{e:{vo=!1,Co&&(Co=!1,Qh(So),So=-1),of=!0;var a=mt;try{t:{for(hu(e),Wt=wa(ja);Wt!==null&&!(Wt.expirationTime>e&&Zh());){var n=Wt.callback;if(typeof n=="function"){Wt.callback=null,mt=Wt.priorityLevel;var l=n(Wt.expirationTime<=e);if(e=ze.unstable_now(),typeof l=="function"){Wt.callback=l,hu(e),t=!0;break t}Wt===wa(ja)&&gu(ja),hu(e)}else gu(ja);Wt=wa(ja)}if(Wt!==null)t=!0;else{var r=wa(Sn);r!==null&&cf(sf,r.startTime-e),t=!1}}break e}finally{Wt=null,mt=a,of=!1}t=void 0}}finally{t?fr():dr=!1}}}var fr;typeof Vh=="function"?fr=function(){Vh(nf)}:typeof MessageChannel<"u"?(lf=new MessageChannel,jh=lf.port2,lf.port1.onmessage=nf,fr=function(){jh.postMessage(null)}):fr=function(){Xh(nf,0)};var lf,jh;function cf(e,t){So=Xh(function(){e(ze.unstable_now())},t)}ze.unstable_IdlePriority=5;ze.unstable_ImmediatePriority=1;ze.unstable_LowPriority=4;ze.unstable_NormalPriority=3;ze.unstable_Profiling=null;ze.unstable_UserBlockingPriority=2;ze.unstable_cancelCallback=function(e){e.callback=null};ze.unstable_forceFrameRate=function(e){0>e||125<e?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):Yh=0<e?Math.floor(1e3/e):5};ze.unstable_getCurrentPriorityLevel=function(){return mt};ze.unstable_next=function(e){switch(mt){case 1:case 2:case 3:var t=3;break;default:t=mt}var a=mt;mt=t;try{return e()}finally{mt=a}};ze.unstable_requestPaint=function(){uf=!0};ze.unstable_runWithPriority=function(e,t){switch(e){case 1:case 2:case 3:case 4:case 5:break;default:e=3}var a=mt;mt=e;try{return t()}finally{mt=a}};ze.unstable_scheduleCallback=function(e,t,a){var n=ze.unstable_now();switch(typeof a=="object"&&a!==null?(a=a.delay,a=typeof a=="number"&&0<a?n+a:n):a=n,e){case 1:var l=-1;break;case 2:l=250;break;case 5:l=1073741823;break;case 4:l=1e4;break;default:l=5e3}return l=a+l,e={id:gC++,callback:t,priorityLevel:e,startTime:a,expirationTime:l,sortIndex:-1},a>n?(e.sortIndex=a,rf(Sn,e),wa(ja)===null&&e===wa(Sn)&&(Co?(Qh(So),So=-1):Co=!0,cf(sf,a-n))):(e.sortIndex=l,rf(ja,e),vo||of||(vo=!0,dr||(dr=!0,fr()))),e};ze.unstable_shouldYield=Zh;ze.unstable_wrapCallback=function(e){var t=mt;return function(){var a=mt;mt=t;try{return e.apply(this,arguments)}finally{mt=a}}}});var $h=Lt((nM,Wh)=>{"use strict";Wh.exports=Jh()});var tg=Lt(vt=>{"use strict";var xC=je();function eg(e){var t="https://react.dev/errors/"+e;if(1<arguments.length){t+="?args[]="+encodeURIComponent(arguments[1]);for(var a=2;a<arguments.length;a++)t+="&args[]="+encodeURIComponent(arguments[a])}return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function kn(){}var bt={d:{f:kn,r:function(){throw Error(eg(522))},D:kn,C:kn,L:kn,m:kn,X:kn,S:kn,M:kn},p:0,findDOMNode:null},yC=Symbol.for("react.portal");function LC(e,t,a){var n=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:yC,key:n==null?null:""+n,children:e,containerInfo:t,implementation:a}}var ko=xC.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;function xu(e,t){if(e==="font")return"";if(typeof t=="string")return t==="use-credentials"?t:""}vt.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=bt;vt.createPortal=function(e,t){var a=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11)throw Error(eg(299));return LC(e,t,null,a)};vt.flushSync=function(e){var t=ko.T,a=bt.p;try{if(ko.T=null,bt.p=2,e)return e()}finally{ko.T=t,bt.p=a,bt.d.f()}};vt.preconnect=function(e,t){typeof e=="string"&&(t?(t=t.crossOrigin,t=typeof t=="string"?t==="use-credentials"?t:"":void 0):t=null,bt.d.C(e,t))};vt.prefetchDNS=function(e){typeof e=="string"&&bt.d.D(e)};vt.preinit=function(e,t){if(typeof e=="string"&&t&&typeof t.as=="string"){var a=t.as,n=xu(a,t.crossOrigin),l=typeof t.integrity=="string"?t.integrity:void 0,r=typeof t.fetchPriority=="string"?t.fetchPriority:void 0;a==="style"?bt.d.S(e,typeof t.precedence=="string"?t.precedence:void 0,{crossOrigin:n,integrity:l,fetchPriority:r}):a==="script"&&bt.d.X(e,{crossOrigin:n,integrity:l,fetchPriority:r,nonce:typeof t.nonce=="string"?t.nonce:void 0})}};vt.preinitModule=function(e,t){if(typeof e=="string")if(typeof t=="object"&&t!==null){if(t.as==null||t.as==="script"){var a=xu(t.as,t.crossOrigin);bt.d.M(e,{crossOrigin:a,integrity:typeof t.integrity=="string"?t.integrity:void 0,nonce:typeof t.nonce=="string"?t.nonce:void 0})}}else t==null&&bt.d.M(e)};vt.preload=function(e,t){if(typeof e=="string"&&typeof t=="object"&&t!==null&&typeof t.as=="string"){var a=t.as,n=xu(a,t.crossOrigin);bt.d.L(e,a,{crossOrigin:n,integrity:typeof t.integrity=="string"?t.integrity:void 0,nonce:typeof t.nonce=="string"?t.nonce:void 0,type:typeof t.type=="string"?t.type:void 0,fetchPriority:typeof t.fetchPriority=="string"?t.fetchPriority:void 0,referrerPolicy:typeof t.referrerPolicy=="string"?t.referrerPolicy:void 0,imageSrcSet:typeof t.imageSrcSet=="string"?t.imageSrcSet:void 0,imageSizes:typeof t.imageSizes=="string"?t.imageSizes:void 0,media:typeof t.media=="string"?t.media:void 0})}};vt.preloadModule=function(e,t){if(typeof e=="string")if(t){var a=xu(t.as,t.crossOrigin);bt.d.m(e,{as:typeof t.as=="string"&&t.as!=="script"?t.as:void 0,crossOrigin:a,integrity:typeof t.integrity=="string"?t.integrity:void 0})}else bt.d.m(e)};vt.requestFormReset=function(e){bt.d.r(e)};vt.unstable_batchedUpdates=function(e,t){return e(t)};vt.useFormState=function(e,t,a){return ko.H.useFormState(e,t,a)};vt.useFormStatus=function(){return ko.H.useHostTransitionStatus()};vt.version="19.2.3"});var lg=Lt((rM,ng)=>{"use strict";function ag(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(ag)}catch(e){console.error(e)}}ag(),ng.exports=tg()});var gL=Lt(_s=>{"use strict";var We=$h(),Mx=je(),bC=lg();function M(e){var t="https://react.dev/errors/"+e;if(1<arguments.length){t+="?args[]="+encodeURIComponent(arguments[1]);for(var a=2;a<arguments.length;a++)t+="&args[]="+encodeURIComponent(arguments[a])}return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function Ex(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function ci(e){var t=e,a=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,(t.flags&4098)!==0&&(a=t.return),e=t.return;while(e)}return t.tag===3?a:null}function zx(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function Bx(e){if(e.tag===31){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function rg(e){if(ci(e)!==e)throw Error(M(188))}function vC(e){var t=e.alternate;if(!t){if(t=ci(e),t===null)throw Error(M(188));return t!==e?null:e}for(var a=e,n=t;;){var l=a.return;if(l===null)break;var r=l.alternate;if(r===null){if(n=l.return,n!==null){a=n;continue}break}if(l.child===r.child){for(r=l.child;r;){if(r===a)return rg(l),e;if(r===n)return rg(l),t;r=r.sibling}throw Error(M(188))}if(a.return!==n.return)a=l,n=r;else{for(var o=!1,i=l.child;i;){if(i===a){o=!0,a=l,n=r;break}if(i===n){o=!0,n=l,a=r;break}i=i.sibling}if(!o){for(i=r.child;i;){if(i===a){o=!0,a=r,n=l;break}if(i===n){o=!0,n=r,a=l;break}i=i.sibling}if(!o)throw Error(M(189))}}if(a.alternate!==n)throw Error(M(190))}if(a.tag!==3)throw Error(M(188));return a.stateNode.current===a?e:t}function Rx(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e;for(e=e.child;e!==null;){if(t=Rx(e),t!==null)return t;e=e.sibling}return null}var Me=Object.assign,CC=Symbol.for("react.element"),yu=Symbol.for("react.transitional.element"),zo=Symbol.for("react.portal"),yr=Symbol.for("react.fragment"),Ox=Symbol.for("react.strict_mode"),Vf=Symbol.for("react.profiler"),Nx=Symbol.for("react.consumer"),$a=Symbol.for("react.context"),Pd=Symbol.for("react.forward_ref"),jf=Symbol.for("react.suspense"),Xf=Symbol.for("react.suspense_list"),Fd=Symbol.for("react.memo"),wn=Symbol.for("react.lazy");Symbol.for("react.scope");var Qf=Symbol.for("react.activity");Symbol.for("react.legacy_hidden");Symbol.for("react.tracing_marker");var SC=Symbol.for("react.memo_cache_sentinel");Symbol.for("react.view_transition");var og=Symbol.iterator;function wo(e){return e===null||typeof e!="object"?null:(e=og&&e[og]||e["@@iterator"],typeof e=="function"?e:null)}var kC=Symbol.for("react.client.reference");function Yf(e){if(e==null)return null;if(typeof e=="function")return e.$$typeof===kC?null:e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case yr:return"Fragment";case Vf:return"Profiler";case Ox:return"StrictMode";case jf:return"Suspense";case Xf:return"SuspenseList";case Qf:return"Activity"}if(typeof e=="object")switch(e.$$typeof){case zo:return"Portal";case $a:return e.displayName||"Context";case Nx:return(e._context.displayName||"Context")+".Consumer";case Pd:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case Fd:return t=e.displayName||null,t!==null?t:Yf(e.type)||"Memo";case wn:t=e._payload,e=e._init;try{return Yf(e(t))}catch{}}return null}var Bo=Array.isArray,W=Mx.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,xe=bC.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,yl={pending:!1,data:null,method:null,action:null},Kf=[],Lr=-1;function Ma(e){return{current:e}}function at(e){0>Lr||(e.current=Kf[Lr],Kf[Lr]=null,Lr--)}function Ie(e,t){Lr++,Kf[Lr]=e.current,e.current=t}var Da=Ma(null),Zo=Ma(null),Nn=Ma(null),Ju=Ma(null);function Wu(e,t){switch(Ie(Nn,t),Ie(Zo,e),Ie(Da,null),t.nodeType){case 9:case 11:e=(e=t.documentElement)&&(e=e.namespaceURI)?px(e):0;break;default:if(e=t.tagName,t=t.namespaceURI)t=px(t),e=aL(t,e);else switch(e){case"svg":e=1;break;case"math":e=2;break;default:e=0}}at(Da),Ie(Da,e)}function qr(){at(Da),at(Zo),at(Nn)}function Zf(e){e.memoizedState!==null&&Ie(Ju,e);var t=Da.current,a=aL(t,e.type);t!==a&&(Ie(Zo,e),Ie(Da,a))}function $u(e){Zo.current===e&&(at(Da),at(Zo)),Ju.current===e&&(at(Ju),ii._currentValue=yl)}var ff,ig;function ml(e){if(ff===void 0)try{throw Error()}catch(a){var t=a.stack.trim().match(/\n( *(at )?)/);ff=t&&t[1]||"",ig=-1<a.stack.indexOf(`
    at`)?" (<anonymous>)":-1<a.stack.indexOf("@")?"@unknown:0:0":""}return`
`+ff+e+ig}var df=!1;function pf(e,t){if(!e||df)return"";df=!0;var a=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{var n={DetermineComponentFrameRoot:function(){try{if(t){var f=function(){throw Error()};if(Object.defineProperty(f.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(f,[])}catch(p){var d=p}Reflect.construct(e,[],f)}else{try{f.call()}catch(p){d=p}e.call(f.prototype)}}else{try{throw Error()}catch(p){d=p}(f=e())&&typeof f.catch=="function"&&f.catch(function(){})}}catch(p){if(p&&d&&typeof p.stack=="string")return[p.stack,d.stack]}return[null,null]}};n.DetermineComponentFrameRoot.displayName="DetermineComponentFrameRoot";var l=Object.getOwnPropertyDescriptor(n.DetermineComponentFrameRoot,"name");l&&l.configurable&&Object.defineProperty(n.DetermineComponentFrameRoot,"name",{value:"DetermineComponentFrameRoot"});var r=n.DetermineComponentFrameRoot(),o=r[0],i=r[1];if(o&&i){var u=o.split(`
`),c=i.split(`
`);for(l=n=0;n<u.length&&!u[n].includes("DetermineComponentFrameRoot");)n++;for(;l<c.length&&!c[l].includes("DetermineComponentFrameRoot");)l++;if(n===u.length||l===c.length)for(n=u.length-1,l=c.length-1;1<=n&&0<=l&&u[n]!==c[l];)l--;for(;1<=n&&0<=l;n--,l--)if(u[n]!==c[l]){if(n!==1||l!==1)do if(n--,l--,0>l||u[n]!==c[l]){var s=`
`+u[n].replace(" at new "," at ");return e.displayName&&s.includes("<anonymous>")&&(s=s.replace("<anonymous>",e.displayName)),s}while(1<=n&&0<=l);break}}}finally{df=!1,Error.prepareStackTrace=a}return(a=e?e.displayName||e.name:"")?ml(a):""}function wC(e,t){switch(e.tag){case 26:case 27:case 5:return ml(e.type);case 16:return ml("Lazy");case 13:return e.child!==t&&t!==null?ml("Suspense Fallback"):ml("Suspense");case 19:return ml("SuspenseList");case 0:case 15:return pf(e.type,!1);case 11:return pf(e.type.render,!1);case 1:return pf(e.type,!0);case 31:return ml("Activity");default:return""}}function ug(e){try{var t="",a=null;do t+=wC(e,a),a=e,e=e.return;while(e);return t}catch(n){return`
Error generating stack: `+n.message+`
`+n.stack}}var Jf=Object.prototype.hasOwnProperty,Hd=We.unstable_scheduleCallback,mf=We.unstable_cancelCallback,IC=We.unstable_shouldYield,AC=We.unstable_requestPaint,Vt=We.unstable_now,TC=We.unstable_getCurrentPriorityLevel,qx=We.unstable_ImmediatePriority,Ux=We.unstable_UserBlockingPriority,es=We.unstable_NormalPriority,DC=We.unstable_LowPriority,Px=We.unstable_IdlePriority,MC=We.log,EC=We.unstable_setDisableYieldValue,fi=null,jt=null;function En(e){if(typeof MC=="function"&&EC(e),jt&&typeof jt.setStrictMode=="function")try{jt.setStrictMode(fi,e)}catch{}}var Xt=Math.clz32?Math.clz32:RC,zC=Math.log,BC=Math.LN2;function RC(e){return e>>>=0,e===0?32:31-(zC(e)/BC|0)|0}var Lu=256,bu=262144,vu=4194304;function hl(e){var t=e&42;if(t!==0)return t;switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:return 64;case 128:return 128;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:return e&261888;case 262144:case 524288:case 1048576:case 2097152:return e&3932160;case 4194304:case 8388608:case 16777216:case 33554432:return e&62914560;case 67108864:return 67108864;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 0;default:return e}}function Is(e,t,a){var n=e.pendingLanes;if(n===0)return 0;var l=0,r=e.suspendedLanes,o=e.pingedLanes;e=e.warmLanes;var i=n&134217727;return i!==0?(n=i&~r,n!==0?l=hl(n):(o&=i,o!==0?l=hl(o):a||(a=i&~e,a!==0&&(l=hl(a))))):(i=n&~r,i!==0?l=hl(i):o!==0?l=hl(o):a||(a=n&~e,a!==0&&(l=hl(a)))),l===0?0:t!==0&&t!==l&&(t&r)===0&&(r=l&-l,a=t&-t,r>=a||r===32&&(a&4194048)!==0)?t:l}function di(e,t){return(e.pendingLanes&~(e.suspendedLanes&~e.pingedLanes)&t)===0}function OC(e,t){switch(e){case 1:case 2:case 4:case 8:case 64:return t+250;case 16:case 32:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:return-1;case 67108864:case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function Fx(){var e=vu;return vu<<=1,(vu&62914560)===0&&(vu=4194304),e}function hf(e){for(var t=[],a=0;31>a;a++)t.push(e);return t}function pi(e,t){e.pendingLanes|=t,t!==268435456&&(e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0)}function NC(e,t,a,n,l,r){var o=e.pendingLanes;e.pendingLanes=a,e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0,e.expiredLanes&=a,e.entangledLanes&=a,e.errorRecoveryDisabledLanes&=a,e.shellSuspendCounter=0;var i=e.entanglements,u=e.expirationTimes,c=e.hiddenUpdates;for(a=o&~a;0<a;){var s=31-Xt(a),f=1<<s;i[s]=0,u[s]=-1;var d=c[s];if(d!==null)for(c[s]=null,s=0;s<d.length;s++){var p=d[s];p!==null&&(p.lane&=-536870913)}a&=~f}n!==0&&Hx(e,n,0),r!==0&&l===0&&e.tag!==0&&(e.suspendedLanes|=r&~(o&~t))}function Hx(e,t,a){e.pendingLanes|=t,e.suspendedLanes&=~t;var n=31-Xt(t);e.entangledLanes|=t,e.entanglements[n]=e.entanglements[n]|1073741824|a&261930}function _x(e,t){var a=e.entangledLanes|=t;for(e=e.entanglements;a;){var n=31-Xt(a),l=1<<n;l&t|e[n]&t&&(e[n]|=t),a&=~l}}function Gx(e,t){var a=t&-t;return a=(a&42)!==0?1:_d(a),(a&(e.suspendedLanes|t))!==0?0:a}function _d(e){switch(e){case 2:e=1;break;case 8:e=4;break;case 32:e=16;break;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:e=128;break;case 268435456:e=134217728;break;default:e=0}return e}function Gd(e){return e&=-e,2<e?8<e?(e&134217727)!==0?32:268435456:8:2}function Vx(){var e=xe.p;return e!==0?e:(e=window.event,e===void 0?32:pL(e.type))}function sg(e,t){var a=xe.p;try{return xe.p=e,t()}finally{xe.p=a}}var Kn=Math.random().toString(36).slice(2),ut="__reactFiber$"+Kn,Et="__reactProps$"+Kn,Yr="__reactContainer$"+Kn,Wf="__reactEvents$"+Kn,qC="__reactListeners$"+Kn,UC="__reactHandles$"+Kn,cg="__reactResources$"+Kn,mi="__reactMarker$"+Kn;function Vd(e){delete e[ut],delete e[Et],delete e[Wf],delete e[qC],delete e[UC]}function br(e){var t=e[ut];if(t)return t;for(var a=e.parentNode;a;){if(t=a[Yr]||a[ut]){if(a=t.alternate,t.child!==null||a!==null&&a.child!==null)for(e=yx(e);e!==null;){if(a=e[ut])return a;e=yx(e)}return t}e=a,a=e.parentNode}return null}function Kr(e){if(e=e[ut]||e[Yr]){var t=e.tag;if(t===5||t===6||t===13||t===31||t===26||t===27||t===3)return e}return null}function Ro(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e.stateNode;throw Error(M(33))}function Mr(e){var t=e[cg];return t||(t=e[cg]={hoistableStyles:new Map,hoistableScripts:new Map}),t}function tt(e){e[mi]=!0}var jx=new Set,Xx={};function Tl(e,t){Ur(e,t),Ur(e+"Capture",t)}function Ur(e,t){for(Xx[e]=t,e=0;e<t.length;e++)jx.add(t[e])}var PC=RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"),fg={},dg={};function FC(e){return Jf.call(dg,e)?!0:Jf.call(fg,e)?!1:PC.test(e)?dg[e]=!0:(fg[e]=!0,!1)}function Nu(e,t,a){if(FC(t))if(a===null)e.removeAttribute(t);else{switch(typeof a){case"undefined":case"function":case"symbol":e.removeAttribute(t);return;case"boolean":var n=t.toLowerCase().slice(0,5);if(n!=="data-"&&n!=="aria-"){e.removeAttribute(t);return}}e.setAttribute(t,""+a)}}function Cu(e,t,a){if(a===null)e.removeAttribute(t);else{switch(typeof a){case"undefined":case"function":case"symbol":case"boolean":e.removeAttribute(t);return}e.setAttribute(t,""+a)}}function Xa(e,t,a,n){if(n===null)e.removeAttribute(a);else{switch(typeof n){case"undefined":case"function":case"symbol":case"boolean":e.removeAttribute(a);return}e.setAttributeNS(t,a,""+n)}}function ea(e){switch(typeof e){case"bigint":case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function Qx(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function HC(e,t,a){var n=Object.getOwnPropertyDescriptor(e.constructor.prototype,t);if(!e.hasOwnProperty(t)&&typeof n<"u"&&typeof n.get=="function"&&typeof n.set=="function"){var l=n.get,r=n.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return l.call(this)},set:function(o){a=""+o,r.call(this,o)}}),Object.defineProperty(e,t,{enumerable:n.enumerable}),{getValue:function(){return a},setValue:function(o){a=""+o},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function $f(e){if(!e._valueTracker){var t=Qx(e)?"checked":"value";e._valueTracker=HC(e,t,""+e[t])}}function Yx(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var a=t.getValue(),n="";return e&&(n=Qx(e)?e.checked?"true":"false":e.value),e=n,e!==a?(t.setValue(e),!0):!1}function ts(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}var _C=/[\n"\\]/g;function na(e){return e.replace(_C,function(t){return"\\"+t.charCodeAt(0).toString(16)+" "})}function ed(e,t,a,n,l,r,o,i){e.name="",o!=null&&typeof o!="function"&&typeof o!="symbol"&&typeof o!="boolean"?e.type=o:e.removeAttribute("type"),t!=null?o==="number"?(t===0&&e.value===""||e.value!=t)&&(e.value=""+ea(t)):e.value!==""+ea(t)&&(e.value=""+ea(t)):o!=="submit"&&o!=="reset"||e.removeAttribute("value"),t!=null?td(e,o,ea(t)):a!=null?td(e,o,ea(a)):n!=null&&e.removeAttribute("value"),l==null&&r!=null&&(e.defaultChecked=!!r),l!=null&&(e.checked=l&&typeof l!="function"&&typeof l!="symbol"),i!=null&&typeof i!="function"&&typeof i!="symbol"&&typeof i!="boolean"?e.name=""+ea(i):e.removeAttribute("name")}function Kx(e,t,a,n,l,r,o,i){if(r!=null&&typeof r!="function"&&typeof r!="symbol"&&typeof r!="boolean"&&(e.type=r),t!=null||a!=null){if(!(r!=="submit"&&r!=="reset"||t!=null)){$f(e);return}a=a!=null?""+ea(a):"",t=t!=null?""+ea(t):a,i||t===e.value||(e.value=t),e.defaultValue=t}n=n??l,n=typeof n!="function"&&typeof n!="symbol"&&!!n,e.checked=i?e.checked:!!n,e.defaultChecked=!!n,o!=null&&typeof o!="function"&&typeof o!="symbol"&&typeof o!="boolean"&&(e.name=o),$f(e)}function td(e,t,a){t==="number"&&ts(e.ownerDocument)===e||e.defaultValue===""+a||(e.defaultValue=""+a)}function Er(e,t,a,n){if(e=e.options,t){t={};for(var l=0;l<a.length;l++)t["$"+a[l]]=!0;for(a=0;a<e.length;a++)l=t.hasOwnProperty("$"+e[a].value),e[a].selected!==l&&(e[a].selected=l),l&&n&&(e[a].defaultSelected=!0)}else{for(a=""+ea(a),t=null,l=0;l<e.length;l++){if(e[l].value===a){e[l].selected=!0,n&&(e[l].defaultSelected=!0);return}t!==null||e[l].disabled||(t=e[l])}t!==null&&(t.selected=!0)}}function Zx(e,t,a){if(t!=null&&(t=""+ea(t),t!==e.value&&(e.value=t),a==null)){e.defaultValue!==t&&(e.defaultValue=t);return}e.defaultValue=a!=null?""+ea(a):""}function Jx(e,t,a,n){if(t==null){if(n!=null){if(a!=null)throw Error(M(92));if(Bo(n)){if(1<n.length)throw Error(M(93));n=n[0]}a=n}a==null&&(a=""),t=a}a=ea(t),e.defaultValue=a,n=e.textContent,n===a&&n!==""&&n!==null&&(e.value=n),$f(e)}function Pr(e,t){if(t){var a=e.firstChild;if(a&&a===e.lastChild&&a.nodeType===3){a.nodeValue=t;return}}e.textContent=t}var GC=new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));function pg(e,t,a){var n=t.indexOf("--")===0;a==null||typeof a=="boolean"||a===""?n?e.setProperty(t,""):t==="float"?e.cssFloat="":e[t]="":n?e.setProperty(t,a):typeof a!="number"||a===0||GC.has(t)?t==="float"?e.cssFloat=a:e[t]=(""+a).trim():e[t]=a+"px"}function Wx(e,t,a){if(t!=null&&typeof t!="object")throw Error(M(62));if(e=e.style,a!=null){for(var n in a)!a.hasOwnProperty(n)||t!=null&&t.hasOwnProperty(n)||(n.indexOf("--")===0?e.setProperty(n,""):n==="float"?e.cssFloat="":e[n]="");for(var l in t)n=t[l],t.hasOwnProperty(l)&&a[l]!==n&&pg(e,l,n)}else for(var r in t)t.hasOwnProperty(r)&&pg(e,r,t[r])}function jd(e){if(e.indexOf("-")===-1)return!1;switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var VC=new Map([["acceptCharset","accept-charset"],["htmlFor","for"],["httpEquiv","http-equiv"],["crossOrigin","crossorigin"],["accentHeight","accent-height"],["alignmentBaseline","alignment-baseline"],["arabicForm","arabic-form"],["baselineShift","baseline-shift"],["capHeight","cap-height"],["clipPath","clip-path"],["clipRule","clip-rule"],["colorInterpolation","color-interpolation"],["colorInterpolationFilters","color-interpolation-filters"],["colorProfile","color-profile"],["colorRendering","color-rendering"],["dominantBaseline","dominant-baseline"],["enableBackground","enable-background"],["fillOpacity","fill-opacity"],["fillRule","fill-rule"],["floodColor","flood-color"],["floodOpacity","flood-opacity"],["fontFamily","font-family"],["fontSize","font-size"],["fontSizeAdjust","font-size-adjust"],["fontStretch","font-stretch"],["fontStyle","font-style"],["fontVariant","font-variant"],["fontWeight","font-weight"],["glyphName","glyph-name"],["glyphOrientationHorizontal","glyph-orientation-horizontal"],["glyphOrientationVertical","glyph-orientation-vertical"],["horizAdvX","horiz-adv-x"],["horizOriginX","horiz-origin-x"],["imageRendering","image-rendering"],["letterSpacing","letter-spacing"],["lightingColor","lighting-color"],["markerEnd","marker-end"],["markerMid","marker-mid"],["markerStart","marker-start"],["overlinePosition","overline-position"],["overlineThickness","overline-thickness"],["paintOrder","paint-order"],["panose-1","panose-1"],["pointerEvents","pointer-events"],["renderingIntent","rendering-intent"],["shapeRendering","shape-rendering"],["stopColor","stop-color"],["stopOpacity","stop-opacity"],["strikethroughPosition","strikethrough-position"],["strikethroughThickness","strikethrough-thickness"],["strokeDasharray","stroke-dasharray"],["strokeDashoffset","stroke-dashoffset"],["strokeLinecap","stroke-linecap"],["strokeLinejoin","stroke-linejoin"],["strokeMiterlimit","stroke-miterlimit"],["strokeOpacity","stroke-opacity"],["strokeWidth","stroke-width"],["textAnchor","text-anchor"],["textDecoration","text-decoration"],["textRendering","text-rendering"],["transformOrigin","transform-origin"],["underlinePosition","underline-position"],["underlineThickness","underline-thickness"],["unicodeBidi","unicode-bidi"],["unicodeRange","unicode-range"],["unitsPerEm","units-per-em"],["vAlphabetic","v-alphabetic"],["vHanging","v-hanging"],["vIdeographic","v-ideographic"],["vMathematical","v-mathematical"],["vectorEffect","vector-effect"],["vertAdvY","vert-adv-y"],["vertOriginX","vert-origin-x"],["vertOriginY","vert-origin-y"],["wordSpacing","word-spacing"],["writingMode","writing-mode"],["xmlnsXlink","xmlns:xlink"],["xHeight","x-height"]]),jC=/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;function qu(e){return jC.test(""+e)?"javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')":e}function en(){}var ad=null;function Xd(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var vr=null,zr=null;function mg(e){var t=Kr(e);if(t&&(e=t.stateNode)){var a=e[Et]||null;e:switch(e=t.stateNode,t.type){case"input":if(ed(e,a.value,a.defaultValue,a.defaultValue,a.checked,a.defaultChecked,a.type,a.name),t=a.name,a.type==="radio"&&t!=null){for(a=e;a.parentNode;)a=a.parentNode;for(a=a.querySelectorAll('input[name="'+na(""+t)+'"][type="radio"]'),t=0;t<a.length;t++){var n=a[t];if(n!==e&&n.form===e.form){var l=n[Et]||null;if(!l)throw Error(M(90));ed(n,l.value,l.defaultValue,l.defaultValue,l.checked,l.defaultChecked,l.type,l.name)}}for(t=0;t<a.length;t++)n=a[t],n.form===e.form&&Yx(n)}break e;case"textarea":Zx(e,a.value,a.defaultValue);break e;case"select":t=a.value,t!=null&&Er(e,!!a.multiple,t,!1)}}}var gf=!1;function $x(e,t,a){if(gf)return e(t,a);gf=!0;try{var n=e(t);return n}finally{if(gf=!1,(vr!==null||zr!==null)&&(Us(),vr&&(t=vr,e=zr,zr=vr=null,mg(t),e)))for(t=0;t<e.length;t++)mg(e[t])}}function Jo(e,t){var a=e.stateNode;if(a===null)return null;var n=a[Et]||null;if(n===null)return null;a=n[t];e:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(n=!n.disabled)||(e=e.type,n=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!n;break e;default:e=!1}if(e)return null;if(a&&typeof a!="function")throw Error(M(231,t,typeof a));return a}var rn=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),nd=!1;if(rn)try{pr={},Object.defineProperty(pr,"passive",{get:function(){nd=!0}}),window.addEventListener("test",pr,pr),window.removeEventListener("test",pr,pr)}catch{nd=!1}var pr,zn=null,Qd=null,Uu=null;function ey(){if(Uu)return Uu;var e,t=Qd,a=t.length,n,l="value"in zn?zn.value:zn.textContent,r=l.length;for(e=0;e<a&&t[e]===l[e];e++);var o=a-e;for(n=1;n<=o&&t[a-n]===l[r-n];n++);return Uu=l.slice(e,1<n?1-n:void 0)}function Pu(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function Su(){return!0}function hg(){return!1}function zt(e){function t(a,n,l,r,o){this._reactName=a,this._targetInst=l,this.type=n,this.nativeEvent=r,this.target=o,this.currentTarget=null;for(var i in e)e.hasOwnProperty(i)&&(a=e[i],this[i]=a?a(r):r[i]);return this.isDefaultPrevented=(r.defaultPrevented!=null?r.defaultPrevented:r.returnValue===!1)?Su:hg,this.isPropagationStopped=hg,this}return Me(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var a=this.nativeEvent;a&&(a.preventDefault?a.preventDefault():typeof a.returnValue!="unknown"&&(a.returnValue=!1),this.isDefaultPrevented=Su)},stopPropagation:function(){var a=this.nativeEvent;a&&(a.stopPropagation?a.stopPropagation():typeof a.cancelBubble!="unknown"&&(a.cancelBubble=!0),this.isPropagationStopped=Su)},persist:function(){},isPersistent:Su}),t}var Dl={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},As=zt(Dl),hi=Me({},Dl,{view:0,detail:0}),XC=zt(hi),xf,yf,Io,Ts=Me({},hi,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Yd,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==Io&&(Io&&e.type==="mousemove"?(xf=e.screenX-Io.screenX,yf=e.screenY-Io.screenY):yf=xf=0,Io=e),xf)},movementY:function(e){return"movementY"in e?e.movementY:yf}}),gg=zt(Ts),QC=Me({},Ts,{dataTransfer:0}),YC=zt(QC),KC=Me({},hi,{relatedTarget:0}),Lf=zt(KC),ZC=Me({},Dl,{animationName:0,elapsedTime:0,pseudoElement:0}),JC=zt(ZC),WC=Me({},Dl,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),$C=zt(WC),eS=Me({},Dl,{data:0}),xg=zt(eS),tS={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},aS={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},nS={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function lS(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=nS[e])?!!t[e]:!1}function Yd(){return lS}var rS=Me({},hi,{key:function(e){if(e.key){var t=tS[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=Pu(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?aS[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Yd,charCode:function(e){return e.type==="keypress"?Pu(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?Pu(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),oS=zt(rS),iS=Me({},Ts,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),yg=zt(iS),uS=Me({},hi,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Yd}),sS=zt(uS),cS=Me({},Dl,{propertyName:0,elapsedTime:0,pseudoElement:0}),fS=zt(cS),dS=Me({},Ts,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),pS=zt(dS),mS=Me({},Dl,{newState:0,oldState:0}),hS=zt(mS),gS=[9,13,27,32],Kd=rn&&"CompositionEvent"in window,qo=null;rn&&"documentMode"in document&&(qo=document.documentMode);var xS=rn&&"TextEvent"in window&&!qo,ty=rn&&(!Kd||qo&&8<qo&&11>=qo),Lg=" ",bg=!1;function ay(e,t){switch(e){case"keyup":return gS.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function ny(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var Cr=!1;function yS(e,t){switch(e){case"compositionend":return ny(t);case"keypress":return t.which!==32?null:(bg=!0,Lg);case"textInput":return e=t.data,e===Lg&&bg?null:e;default:return null}}function LS(e,t){if(Cr)return e==="compositionend"||!Kd&&ay(e,t)?(e=ey(),Uu=Qd=zn=null,Cr=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return ty&&t.locale!=="ko"?null:t.data;default:return null}}var bS={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function vg(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!bS[e.type]:t==="textarea"}function ly(e,t,a,n){vr?zr?zr.push(n):zr=[n]:vr=n,t=Ls(t,"onChange"),0<t.length&&(a=new As("onChange","change",null,a,n),e.push({event:a,listeners:t}))}var Uo=null,Wo=null;function vS(e){$1(e,0)}function Ds(e){var t=Ro(e);if(Yx(t))return e}function Cg(e,t){if(e==="change")return t}var ry=!1;rn&&(rn?(wu="oninput"in document,wu||(bf=document.createElement("div"),bf.setAttribute("oninput","return;"),wu=typeof bf.oninput=="function"),ku=wu):ku=!1,ry=ku&&(!document.documentMode||9<document.documentMode));var ku,wu,bf;function Sg(){Uo&&(Uo.detachEvent("onpropertychange",oy),Wo=Uo=null)}function oy(e){if(e.propertyName==="value"&&Ds(Wo)){var t=[];ly(t,Wo,e,Xd(e)),$x(vS,t)}}function CS(e,t,a){e==="focusin"?(Sg(),Uo=t,Wo=a,Uo.attachEvent("onpropertychange",oy)):e==="focusout"&&Sg()}function SS(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return Ds(Wo)}function kS(e,t){if(e==="click")return Ds(t)}function wS(e,t){if(e==="input"||e==="change")return Ds(t)}function IS(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var Yt=typeof Object.is=="function"?Object.is:IS;function $o(e,t){if(Yt(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var a=Object.keys(e),n=Object.keys(t);if(a.length!==n.length)return!1;for(n=0;n<a.length;n++){var l=a[n];if(!Jf.call(t,l)||!Yt(e[l],t[l]))return!1}return!0}function kg(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function wg(e,t){var a=kg(e);e=0;for(var n;a;){if(a.nodeType===3){if(n=e+a.textContent.length,e<=t&&n>=t)return{node:a,offset:t-e};e=n}e:{for(;a;){if(a.nextSibling){a=a.nextSibling;break e}a=a.parentNode}a=void 0}a=kg(a)}}function iy(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?iy(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function uy(e){e=e!=null&&e.ownerDocument!=null&&e.ownerDocument.defaultView!=null?e.ownerDocument.defaultView:window;for(var t=ts(e.document);t instanceof e.HTMLIFrameElement;){try{var a=typeof t.contentWindow.location.href=="string"}catch{a=!1}if(a)e=t.contentWindow;else break;t=ts(e.document)}return t}function Zd(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}var AS=rn&&"documentMode"in document&&11>=document.documentMode,Sr=null,ld=null,Po=null,rd=!1;function Ig(e,t,a){var n=a.window===a?a.document:a.nodeType===9?a:a.ownerDocument;rd||Sr==null||Sr!==ts(n)||(n=Sr,"selectionStart"in n&&Zd(n)?n={start:n.selectionStart,end:n.selectionEnd}:(n=(n.ownerDocument&&n.ownerDocument.defaultView||window).getSelection(),n={anchorNode:n.anchorNode,anchorOffset:n.anchorOffset,focusNode:n.focusNode,focusOffset:n.focusOffset}),Po&&$o(Po,n)||(Po=n,n=Ls(ld,"onSelect"),0<n.length&&(t=new As("onSelect","select",null,t,a),e.push({event:t,listeners:n}),t.target=Sr)))}function pl(e,t){var a={};return a[e.toLowerCase()]=t.toLowerCase(),a["Webkit"+e]="webkit"+t,a["Moz"+e]="moz"+t,a}var kr={animationend:pl("Animation","AnimationEnd"),animationiteration:pl("Animation","AnimationIteration"),animationstart:pl("Animation","AnimationStart"),transitionrun:pl("Transition","TransitionRun"),transitionstart:pl("Transition","TransitionStart"),transitioncancel:pl("Transition","TransitionCancel"),transitionend:pl("Transition","TransitionEnd")},vf={},sy={};rn&&(sy=document.createElement("div").style,"AnimationEvent"in window||(delete kr.animationend.animation,delete kr.animationiteration.animation,delete kr.animationstart.animation),"TransitionEvent"in window||delete kr.transitionend.transition);function Ml(e){if(vf[e])return vf[e];if(!kr[e])return e;var t=kr[e],a;for(a in t)if(t.hasOwnProperty(a)&&a in sy)return vf[e]=t[a];return e}var cy=Ml("animationend"),fy=Ml("animationiteration"),dy=Ml("animationstart"),TS=Ml("transitionrun"),DS=Ml("transitionstart"),MS=Ml("transitioncancel"),py=Ml("transitionend"),my=new Map,od="abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");od.push("scrollEnd");function ba(e,t){my.set(e,t),Tl(t,[e])}var as=typeof reportError=="function"?reportError:function(e){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof e=="object"&&e!==null&&typeof e.message=="string"?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",e);return}console.error(e)},$t=[],wr=0,Jd=0;function Ms(){for(var e=wr,t=Jd=wr=0;t<e;){var a=$t[t];$t[t++]=null;var n=$t[t];$t[t++]=null;var l=$t[t];$t[t++]=null;var r=$t[t];if($t[t++]=null,n!==null&&l!==null){var o=n.pending;o===null?l.next=l:(l.next=o.next,o.next=l),n.pending=l}r!==0&&hy(a,l,r)}}function Es(e,t,a,n){$t[wr++]=e,$t[wr++]=t,$t[wr++]=a,$t[wr++]=n,Jd|=n,e.lanes|=n,e=e.alternate,e!==null&&(e.lanes|=n)}function Wd(e,t,a,n){return Es(e,t,a,n),ns(e)}function El(e,t){return Es(e,null,null,t),ns(e)}function hy(e,t,a){e.lanes|=a;var n=e.alternate;n!==null&&(n.lanes|=a);for(var l=!1,r=e.return;r!==null;)r.childLanes|=a,n=r.alternate,n!==null&&(n.childLanes|=a),r.tag===22&&(e=r.stateNode,e===null||e._visibility&1||(l=!0)),e=r,r=r.return;return e.tag===3?(r=e.stateNode,l&&t!==null&&(l=31-Xt(a),e=r.hiddenUpdates,n=e[l],n===null?e[l]=[t]:n.push(t),t.lane=a|536870912),r):null}function ns(e){if(50<Yo)throw Yo=0,Ad=null,Error(M(185));for(var t=e.return;t!==null;)e=t,t=e.return;return e.tag===3?e.stateNode:null}var Ir={};function ES(e,t,a,n){this.tag=e,this.key=a,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.refCleanup=this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=n,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function _t(e,t,a,n){return new ES(e,t,a,n)}function $d(e){return e=e.prototype,!(!e||!e.isReactComponent)}function an(e,t){var a=e.alternate;return a===null?(a=_t(e.tag,t,e.key,e.mode),a.elementType=e.elementType,a.type=e.type,a.stateNode=e.stateNode,a.alternate=e,e.alternate=a):(a.pendingProps=t,a.type=e.type,a.flags=0,a.subtreeFlags=0,a.deletions=null),a.flags=e.flags&65011712,a.childLanes=e.childLanes,a.lanes=e.lanes,a.child=e.child,a.memoizedProps=e.memoizedProps,a.memoizedState=e.memoizedState,a.updateQueue=e.updateQueue,t=e.dependencies,a.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},a.sibling=e.sibling,a.index=e.index,a.ref=e.ref,a.refCleanup=e.refCleanup,a}function gy(e,t){e.flags&=65011714;var a=e.alternate;return a===null?(e.childLanes=0,e.lanes=t,e.child=null,e.subtreeFlags=0,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null,e.stateNode=null):(e.childLanes=a.childLanes,e.lanes=a.lanes,e.child=a.child,e.subtreeFlags=0,e.deletions=null,e.memoizedProps=a.memoizedProps,e.memoizedState=a.memoizedState,e.updateQueue=a.updateQueue,e.type=a.type,t=a.dependencies,e.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext}),e}function Fu(e,t,a,n,l,r){var o=0;if(n=e,typeof e=="function")$d(e)&&(o=1);else if(typeof e=="string")o=Rk(e,a,Da.current)?26:e==="html"||e==="head"||e==="body"?27:5;else e:switch(e){case Qf:return e=_t(31,a,t,l),e.elementType=Qf,e.lanes=r,e;case yr:return Ll(a.children,l,r,t);case Ox:o=8,l|=24;break;case Vf:return e=_t(12,a,t,l|2),e.elementType=Vf,e.lanes=r,e;case jf:return e=_t(13,a,t,l),e.elementType=jf,e.lanes=r,e;case Xf:return e=_t(19,a,t,l),e.elementType=Xf,e.lanes=r,e;default:if(typeof e=="object"&&e!==null)switch(e.$$typeof){case $a:o=10;break e;case Nx:o=9;break e;case Pd:o=11;break e;case Fd:o=14;break e;case wn:o=16,n=null;break e}o=29,a=Error(M(130,e===null?"null":typeof e,"")),n=null}return t=_t(o,a,t,l),t.elementType=e,t.type=n,t.lanes=r,t}function Ll(e,t,a,n){return e=_t(7,e,n,t),e.lanes=a,e}function Cf(e,t,a){return e=_t(6,e,null,t),e.lanes=a,e}function xy(e){var t=_t(18,null,null,0);return t.stateNode=e,t}function Sf(e,t,a){return t=_t(4,e.children!==null?e.children:[],e.key,t),t.lanes=a,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}var Ag=new WeakMap;function la(e,t){if(typeof e=="object"&&e!==null){var a=Ag.get(e);return a!==void 0?a:(t={value:e,source:t,stack:ug(t)},Ag.set(e,t),t)}return{value:e,source:t,stack:ug(t)}}var Ar=[],Tr=0,ls=null,ei=0,ta=[],aa=0,jn=null,Ia=1,Aa="";function Ja(e,t){Ar[Tr++]=ei,Ar[Tr++]=ls,ls=e,ei=t}function yy(e,t,a){ta[aa++]=Ia,ta[aa++]=Aa,ta[aa++]=jn,jn=e;var n=Ia;e=Aa;var l=32-Xt(n)-1;n&=~(1<<l),a+=1;var r=32-Xt(t)+l;if(30<r){var o=l-l%5;r=(n&(1<<o)-1).toString(32),n>>=o,l-=o,Ia=1<<32-Xt(t)+l|a<<l|n,Aa=r+e}else Ia=1<<r|a<<l|n,Aa=e}function ep(e){e.return!==null&&(Ja(e,1),yy(e,1,0))}function tp(e){for(;e===ls;)ls=Ar[--Tr],Ar[Tr]=null,ei=Ar[--Tr],Ar[Tr]=null;for(;e===jn;)jn=ta[--aa],ta[aa]=null,Aa=ta[--aa],ta[aa]=null,Ia=ta[--aa],ta[aa]=null}function Ly(e,t){ta[aa++]=Ia,ta[aa++]=Aa,ta[aa++]=jn,Ia=t.id,Aa=t.overflow,jn=e}var st=null,De=null,pe=!1,qn=null,ra=!1,id=Error(M(519));function Xn(e){var t=Error(M(418,1<arguments.length&&arguments[1]!==void 0&&arguments[1]?"text":"HTML",""));throw ti(la(t,e)),id}function Tg(e){var t=e.stateNode,a=e.type,n=e.memoizedProps;switch(t[ut]=e,t[Et]=n,a){case"dialog":ue("cancel",t),ue("close",t);break;case"iframe":case"object":case"embed":ue("load",t);break;case"video":case"audio":for(a=0;a<ri.length;a++)ue(ri[a],t);break;case"source":ue("error",t);break;case"img":case"image":case"link":ue("error",t),ue("load",t);break;case"details":ue("toggle",t);break;case"input":ue("invalid",t),Kx(t,n.value,n.defaultValue,n.checked,n.defaultChecked,n.type,n.name,!0);break;case"select":ue("invalid",t);break;case"textarea":ue("invalid",t),Jx(t,n.value,n.defaultValue,n.children)}a=n.children,typeof a!="string"&&typeof a!="number"&&typeof a!="bigint"||t.textContent===""+a||n.suppressHydrationWarning===!0||tL(t.textContent,a)?(n.popover!=null&&(ue("beforetoggle",t),ue("toggle",t)),n.onScroll!=null&&ue("scroll",t),n.onScrollEnd!=null&&ue("scrollend",t),n.onClick!=null&&(t.onclick=en),t=!0):t=!1,t||Xn(e,!0)}function Dg(e){for(st=e.return;st;)switch(st.tag){case 5:case 31:case 13:ra=!1;return;case 27:case 3:ra=!0;return;default:st=st.return}}function mr(e){if(e!==st)return!1;if(!pe)return Dg(e),pe=!0,!1;var t=e.tag,a;if((a=t!==3&&t!==27)&&((a=t===5)&&(a=e.type,a=!(a!=="form"&&a!=="button")||zd(e.type,e.memoizedProps)),a=!a),a&&De&&Xn(e),Dg(e),t===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(M(317));De=xx(e)}else if(t===31){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(M(317));De=xx(e)}else t===27?(t=De,Zn(e.type)?(e=Nd,Nd=null,De=e):De=t):De=st?ia(e.stateNode.nextSibling):null;return!0}function Sl(){De=st=null,pe=!1}function kf(){var e=qn;return e!==null&&(Dt===null?Dt=e:Dt.push.apply(Dt,e),qn=null),e}function ti(e){qn===null?qn=[e]:qn.push(e)}var ud=Ma(null),zl=null,tn=null;function An(e,t,a){Ie(ud,t._currentValue),t._currentValue=a}function nn(e){e._currentValue=ud.current,at(ud)}function sd(e,t,a){for(;e!==null;){var n=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,n!==null&&(n.childLanes|=t)):n!==null&&(n.childLanes&t)!==t&&(n.childLanes|=t),e===a)break;e=e.return}}function cd(e,t,a,n){var l=e.child;for(l!==null&&(l.return=e);l!==null;){var r=l.dependencies;if(r!==null){var o=l.child;r=r.firstContext;e:for(;r!==null;){var i=r;r=l;for(var u=0;u<t.length;u++)if(i.context===t[u]){r.lanes|=a,i=r.alternate,i!==null&&(i.lanes|=a),sd(r.return,a,e),n||(o=null);break e}r=i.next}}else if(l.tag===18){if(o=l.return,o===null)throw Error(M(341));o.lanes|=a,r=o.alternate,r!==null&&(r.lanes|=a),sd(o,a,e),o=null}else o=l.child;if(o!==null)o.return=l;else for(o=l;o!==null;){if(o===e){o=null;break}if(l=o.sibling,l!==null){l.return=o.return,o=l;break}o=o.return}l=o}}function Zr(e,t,a,n){e=null;for(var l=t,r=!1;l!==null;){if(!r){if((l.flags&524288)!==0)r=!0;else if((l.flags&262144)!==0)break}if(l.tag===10){var o=l.alternate;if(o===null)throw Error(M(387));if(o=o.memoizedProps,o!==null){var i=l.type;Yt(l.pendingProps.value,o.value)||(e!==null?e.push(i):e=[i])}}else if(l===Ju.current){if(o=l.alternate,o===null)throw Error(M(387));o.memoizedState.memoizedState!==l.memoizedState.memoizedState&&(e!==null?e.push(ii):e=[ii])}l=l.return}e!==null&&cd(t,e,a,n),t.flags|=262144}function rs(e){for(e=e.firstContext;e!==null;){if(!Yt(e.context._currentValue,e.memoizedValue))return!0;e=e.next}return!1}function kl(e){zl=e,tn=null,e=e.dependencies,e!==null&&(e.firstContext=null)}function ct(e){return by(zl,e)}function Iu(e,t){return zl===null&&kl(e),by(e,t)}function by(e,t){var a=t._currentValue;if(t={context:t,memoizedValue:a,next:null},tn===null){if(e===null)throw Error(M(308));tn=t,e.dependencies={lanes:0,firstContext:t},e.flags|=524288}else tn=tn.next=t;return a}var zS=typeof AbortController<"u"?AbortController:function(){var e=[],t=this.signal={aborted:!1,addEventListener:function(a,n){e.push(n)}};this.abort=function(){t.aborted=!0,e.forEach(function(a){return a()})}},BS=We.unstable_scheduleCallback,RS=We.unstable_NormalPriority,Ye={$$typeof:$a,Consumer:null,Provider:null,_currentValue:null,_currentValue2:null,_threadCount:0};function ap(){return{controller:new zS,data:new Map,refCount:0}}function gi(e){e.refCount--,e.refCount===0&&BS(RS,function(){e.controller.abort()})}var Fo=null,fd=0,Fr=0,Br=null;function OS(e,t){if(Fo===null){var a=Fo=[];fd=0,Fr=Ap(),Br={status:"pending",value:void 0,then:function(n){a.push(n)}}}return fd++,t.then(Mg,Mg),t}function Mg(){if(--fd===0&&Fo!==null){Br!==null&&(Br.status="fulfilled");var e=Fo;Fo=null,Fr=0,Br=null;for(var t=0;t<e.length;t++)(0,e[t])()}}function NS(e,t){var a=[],n={status:"pending",value:null,reason:null,then:function(l){a.push(l)}};return e.then(function(){n.status="fulfilled",n.value=t;for(var l=0;l<a.length;l++)(0,a[l])(t)},function(l){for(n.status="rejected",n.reason=l,l=0;l<a.length;l++)(0,a[l])(void 0)}),n}var Eg=W.S;W.S=function(e,t){R1=Vt(),typeof t=="object"&&t!==null&&typeof t.then=="function"&&OS(e,t),Eg!==null&&Eg(e,t)};var bl=Ma(null);function np(){var e=bl.current;return e!==null?e:we.pooledCache}function Hu(e,t){t===null?Ie(bl,bl.current):Ie(bl,t.pool)}function vy(){var e=np();return e===null?null:{parent:Ye._currentValue,pool:e}}var Jr=Error(M(460)),lp=Error(M(474)),zs=Error(M(542)),os={then:function(){}};function zg(e){return e=e.status,e==="fulfilled"||e==="rejected"}function Cy(e,t,a){switch(a=e[a],a===void 0?e.push(t):a!==t&&(t.then(en,en),t=a),t.status){case"fulfilled":return t.value;case"rejected":throw e=t.reason,Rg(e),e;default:if(typeof t.status=="string")t.then(en,en);else{if(e=we,e!==null&&100<e.shellSuspendCounter)throw Error(M(482));e=t,e.status="pending",e.then(function(n){if(t.status==="pending"){var l=t;l.status="fulfilled",l.value=n}},function(n){if(t.status==="pending"){var l=t;l.status="rejected",l.reason=n}})}switch(t.status){case"fulfilled":return t.value;case"rejected":throw e=t.reason,Rg(e),e}throw vl=t,Jr}}function gl(e){try{var t=e._init;return t(e._payload)}catch(a){throw a!==null&&typeof a=="object"&&typeof a.then=="function"?(vl=a,Jr):a}}var vl=null;function Bg(){if(vl===null)throw Error(M(459));var e=vl;return vl=null,e}function Rg(e){if(e===Jr||e===zs)throw Error(M(483))}var Rr=null,ai=0;function Au(e){var t=ai;return ai+=1,Rr===null&&(Rr=[]),Cy(Rr,e,t)}function Ao(e,t){t=t.props.ref,e.ref=t!==void 0?t:null}function Tu(e,t){throw t.$$typeof===CC?Error(M(525)):(e=Object.prototype.toString.call(t),Error(M(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e)))}function Sy(e){function t(x,m){if(e){var h=x.deletions;h===null?(x.deletions=[m],x.flags|=16):h.push(m)}}function a(x,m){if(!e)return null;for(;m!==null;)t(x,m),m=m.sibling;return null}function n(x){for(var m=new Map;x!==null;)x.key!==null?m.set(x.key,x):m.set(x.index,x),x=x.sibling;return m}function l(x,m){return x=an(x,m),x.index=0,x.sibling=null,x}function r(x,m,h){return x.index=h,e?(h=x.alternate,h!==null?(h=h.index,h<m?(x.flags|=67108866,m):h):(x.flags|=67108866,m)):(x.flags|=1048576,m)}function o(x){return e&&x.alternate===null&&(x.flags|=67108866),x}function i(x,m,h,L){return m===null||m.tag!==6?(m=Cf(h,x.mode,L),m.return=x,m):(m=l(m,h),m.return=x,m)}function u(x,m,h,L){var I=h.type;return I===yr?s(x,m,h.props.children,L,h.key):m!==null&&(m.elementType===I||typeof I=="object"&&I!==null&&I.$$typeof===wn&&gl(I)===m.type)?(m=l(m,h.props),Ao(m,h),m.return=x,m):(m=Fu(h.type,h.key,h.props,null,x.mode,L),Ao(m,h),m.return=x,m)}function c(x,m,h,L){return m===null||m.tag!==4||m.stateNode.containerInfo!==h.containerInfo||m.stateNode.implementation!==h.implementation?(m=Sf(h,x.mode,L),m.return=x,m):(m=l(m,h.children||[]),m.return=x,m)}function s(x,m,h,L,I){return m===null||m.tag!==7?(m=Ll(h,x.mode,L,I),m.return=x,m):(m=l(m,h),m.return=x,m)}function f(x,m,h){if(typeof m=="string"&&m!==""||typeof m=="number"||typeof m=="bigint")return m=Cf(""+m,x.mode,h),m.return=x,m;if(typeof m=="object"&&m!==null){switch(m.$$typeof){case yu:return h=Fu(m.type,m.key,m.props,null,x.mode,h),Ao(h,m),h.return=x,h;case zo:return m=Sf(m,x.mode,h),m.return=x,m;case wn:return m=gl(m),f(x,m,h)}if(Bo(m)||wo(m))return m=Ll(m,x.mode,h,null),m.return=x,m;if(typeof m.then=="function")return f(x,Au(m),h);if(m.$$typeof===$a)return f(x,Iu(x,m),h);Tu(x,m)}return null}function d(x,m,h,L){var I=m!==null?m.key:null;if(typeof h=="string"&&h!==""||typeof h=="number"||typeof h=="bigint")return I!==null?null:i(x,m,""+h,L);if(typeof h=="object"&&h!==null){switch(h.$$typeof){case yu:return h.key===I?u(x,m,h,L):null;case zo:return h.key===I?c(x,m,h,L):null;case wn:return h=gl(h),d(x,m,h,L)}if(Bo(h)||wo(h))return I!==null?null:s(x,m,h,L,null);if(typeof h.then=="function")return d(x,m,Au(h),L);if(h.$$typeof===$a)return d(x,m,Iu(x,h),L);Tu(x,h)}return null}function p(x,m,h,L,I){if(typeof L=="string"&&L!==""||typeof L=="number"||typeof L=="bigint")return x=x.get(h)||null,i(m,x,""+L,I);if(typeof L=="object"&&L!==null){switch(L.$$typeof){case yu:return x=x.get(L.key===null?h:L.key)||null,u(m,x,L,I);case zo:return x=x.get(L.key===null?h:L.key)||null,c(m,x,L,I);case wn:return L=gl(L),p(x,m,h,L,I)}if(Bo(L)||wo(L))return x=x.get(h)||null,s(m,x,L,I,null);if(typeof L.then=="function")return p(x,m,h,Au(L),I);if(L.$$typeof===$a)return p(x,m,h,Iu(m,L),I);Tu(m,L)}return null}function g(x,m,h,L){for(var I=null,C=null,T=m,N=m=0,P=null;T!==null&&N<h.length;N++){T.index>N?(P=T,T=null):P=T.sibling;var k=d(x,T,h[N],L);if(k===null){T===null&&(T=P);break}e&&T&&k.alternate===null&&t(x,T),m=r(k,m,N),C===null?I=k:C.sibling=k,C=k,T=P}if(N===h.length)return a(x,T),pe&&Ja(x,N),I;if(T===null){for(;N<h.length;N++)T=f(x,h[N],L),T!==null&&(m=r(T,m,N),C===null?I=T:C.sibling=T,C=T);return pe&&Ja(x,N),I}for(T=n(T);N<h.length;N++)P=p(T,x,N,h[N],L),P!==null&&(e&&P.alternate!==null&&T.delete(P.key===null?N:P.key),m=r(P,m,N),C===null?I=P:C.sibling=P,C=P);return e&&T.forEach(function(oe){return t(x,oe)}),pe&&Ja(x,N),I}function y(x,m,h,L){if(h==null)throw Error(M(151));for(var I=null,C=null,T=m,N=m=0,P=null,k=h.next();T!==null&&!k.done;N++,k=h.next()){T.index>N?(P=T,T=null):P=T.sibling;var oe=d(x,T,k.value,L);if(oe===null){T===null&&(T=P);break}e&&T&&oe.alternate===null&&t(x,T),m=r(oe,m,N),C===null?I=oe:C.sibling=oe,C=oe,T=P}if(k.done)return a(x,T),pe&&Ja(x,N),I;if(T===null){for(;!k.done;N++,k=h.next())k=f(x,k.value,L),k!==null&&(m=r(k,m,N),C===null?I=k:C.sibling=k,C=k);return pe&&Ja(x,N),I}for(T=n(T);!k.done;N++,k=h.next())k=p(T,x,N,k.value,L),k!==null&&(e&&k.alternate!==null&&T.delete(k.key===null?N:k.key),m=r(k,m,N),C===null?I=k:C.sibling=k,C=k);return e&&T.forEach(function(ne){return t(x,ne)}),pe&&Ja(x,N),I}function w(x,m,h,L){if(typeof h=="object"&&h!==null&&h.type===yr&&h.key===null&&(h=h.props.children),typeof h=="object"&&h!==null){switch(h.$$typeof){case yu:e:{for(var I=h.key;m!==null;){if(m.key===I){if(I=h.type,I===yr){if(m.tag===7){a(x,m.sibling),L=l(m,h.props.children),L.return=x,x=L;break e}}else if(m.elementType===I||typeof I=="object"&&I!==null&&I.$$typeof===wn&&gl(I)===m.type){a(x,m.sibling),L=l(m,h.props),Ao(L,h),L.return=x,x=L;break e}a(x,m);break}else t(x,m);m=m.sibling}h.type===yr?(L=Ll(h.props.children,x.mode,L,h.key),L.return=x,x=L):(L=Fu(h.type,h.key,h.props,null,x.mode,L),Ao(L,h),L.return=x,x=L)}return o(x);case zo:e:{for(I=h.key;m!==null;){if(m.key===I)if(m.tag===4&&m.stateNode.containerInfo===h.containerInfo&&m.stateNode.implementation===h.implementation){a(x,m.sibling),L=l(m,h.children||[]),L.return=x,x=L;break e}else{a(x,m);break}else t(x,m);m=m.sibling}L=Sf(h,x.mode,L),L.return=x,x=L}return o(x);case wn:return h=gl(h),w(x,m,h,L)}if(Bo(h))return g(x,m,h,L);if(wo(h)){if(I=wo(h),typeof I!="function")throw Error(M(150));return h=I.call(h),y(x,m,h,L)}if(typeof h.then=="function")return w(x,m,Au(h),L);if(h.$$typeof===$a)return w(x,m,Iu(x,h),L);Tu(x,h)}return typeof h=="string"&&h!==""||typeof h=="number"||typeof h=="bigint"?(h=""+h,m!==null&&m.tag===6?(a(x,m.sibling),L=l(m,h),L.return=x,x=L):(a(x,m),L=Cf(h,x.mode,L),L.return=x,x=L),o(x)):a(x,m)}return function(x,m,h,L){try{ai=0;var I=w(x,m,h,L);return Rr=null,I}catch(T){if(T===Jr||T===zs)throw T;var C=_t(29,T,null,x.mode);return C.lanes=L,C.return=x,C}finally{}}}var wl=Sy(!0),ky=Sy(!1),In=!1;function rp(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,lanes:0,hiddenCallbacks:null},callbacks:null}}function dd(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,callbacks:null})}function Un(e){return{lane:e,tag:0,payload:null,callback:null,next:null}}function Pn(e,t,a){var n=e.updateQueue;if(n===null)return null;if(n=n.shared,(ge&2)!==0){var l=n.pending;return l===null?t.next=t:(t.next=l.next,l.next=t),n.pending=t,t=ns(e),hy(e,null,a),t}return Es(e,n,t,a),ns(e)}function Ho(e,t,a){if(t=t.updateQueue,t!==null&&(t=t.shared,(a&4194048)!==0)){var n=t.lanes;n&=e.pendingLanes,a|=n,t.lanes=a,_x(e,a)}}function wf(e,t){var a=e.updateQueue,n=e.alternate;if(n!==null&&(n=n.updateQueue,a===n)){var l=null,r=null;if(a=a.firstBaseUpdate,a!==null){do{var o={lane:a.lane,tag:a.tag,payload:a.payload,callback:null,next:null};r===null?l=r=o:r=r.next=o,a=a.next}while(a!==null);r===null?l=r=t:r=r.next=t}else l=r=t;a={baseState:n.baseState,firstBaseUpdate:l,lastBaseUpdate:r,shared:n.shared,callbacks:n.callbacks},e.updateQueue=a;return}e=a.lastBaseUpdate,e===null?a.firstBaseUpdate=t:e.next=t,a.lastBaseUpdate=t}var pd=!1;function _o(){if(pd){var e=Br;if(e!==null)throw e}}function Go(e,t,a,n){pd=!1;var l=e.updateQueue;In=!1;var r=l.firstBaseUpdate,o=l.lastBaseUpdate,i=l.shared.pending;if(i!==null){l.shared.pending=null;var u=i,c=u.next;u.next=null,o===null?r=c:o.next=c,o=u;var s=e.alternate;s!==null&&(s=s.updateQueue,i=s.lastBaseUpdate,i!==o&&(i===null?s.firstBaseUpdate=c:i.next=c,s.lastBaseUpdate=u))}if(r!==null){var f=l.baseState;o=0,s=c=u=null,i=r;do{var d=i.lane&-536870913,p=d!==i.lane;if(p?(fe&d)===d:(n&d)===d){d!==0&&d===Fr&&(pd=!0),s!==null&&(s=s.next={lane:0,tag:i.tag,payload:i.payload,callback:null,next:null});e:{var g=e,y=i;d=t;var w=a;switch(y.tag){case 1:if(g=y.payload,typeof g=="function"){f=g.call(w,f,d);break e}f=g;break e;case 3:g.flags=g.flags&-65537|128;case 0:if(g=y.payload,d=typeof g=="function"?g.call(w,f,d):g,d==null)break e;f=Me({},f,d);break e;case 2:In=!0}}d=i.callback,d!==null&&(e.flags|=64,p&&(e.flags|=8192),p=l.callbacks,p===null?l.callbacks=[d]:p.push(d))}else p={lane:d,tag:i.tag,payload:i.payload,callback:i.callback,next:null},s===null?(c=s=p,u=f):s=s.next=p,o|=d;if(i=i.next,i===null){if(i=l.shared.pending,i===null)break;p=i,i=p.next,p.next=null,l.lastBaseUpdate=p,l.shared.pending=null}}while(!0);s===null&&(u=f),l.baseState=u,l.firstBaseUpdate=c,l.lastBaseUpdate=s,r===null&&(l.shared.lanes=0),Yn|=o,e.lanes=o,e.memoizedState=f}}function wy(e,t){if(typeof e!="function")throw Error(M(191,e));e.call(t)}function Iy(e,t){var a=e.callbacks;if(a!==null)for(e.callbacks=null,e=0;e<a.length;e++)wy(a[e],t)}var Hr=Ma(null),is=Ma(0);function Og(e,t){e=cn,Ie(is,e),Ie(Hr,t),cn=e|t.baseLanes}function md(){Ie(is,cn),Ie(Hr,Hr.current)}function op(){cn=is.current,at(Hr),at(is)}var Kt=Ma(null),oa=null;function Tn(e){var t=e.alternate;Ie(He,He.current&1),Ie(Kt,e),oa===null&&(t===null||Hr.current!==null||t.memoizedState!==null)&&(oa=e)}function hd(e){Ie(He,He.current),Ie(Kt,e),oa===null&&(oa=e)}function Ay(e){e.tag===22?(Ie(He,He.current),Ie(Kt,e),oa===null&&(oa=e)):Dn(e)}function Dn(){Ie(He,He.current),Ie(Kt,Kt.current)}function Ht(e){at(Kt),oa===e&&(oa=null),at(He)}var He=Ma(0);function us(e){for(var t=e;t!==null;){if(t.tag===13){var a=t.memoizedState;if(a!==null&&(a=a.dehydrated,a===null||Rd(a)||Od(a)))return t}else if(t.tag===19&&(t.memoizedProps.revealOrder==="forwards"||t.memoizedProps.revealOrder==="backwards"||t.memoizedProps.revealOrder==="unstable_legacy-backwards"||t.memoizedProps.revealOrder==="together")){if((t.flags&128)!==0)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var on=0,le=null,Se=null,Xe=null,ss=!1,Or=!1,Il=!1,cs=0,ni=0,Nr=null,qS=0;function Ne(){throw Error(M(321))}function ip(e,t){if(t===null)return!1;for(var a=0;a<t.length&&a<e.length;a++)if(!Yt(e[a],t[a]))return!1;return!0}function up(e,t,a,n,l,r){return on=r,le=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,W.H=e===null||e.memoizedState===null?l1:Lp,Il=!1,r=a(n,l),Il=!1,Or&&(r=Dy(t,a,n,l)),Ty(e),r}function Ty(e){W.H=li;var t=Se!==null&&Se.next!==null;if(on=0,Xe=Se=le=null,ss=!1,ni=0,Nr=null,t)throw Error(M(300));e===null||Ke||(e=e.dependencies,e!==null&&rs(e)&&(Ke=!0))}function Dy(e,t,a,n){le=e;var l=0;do{if(Or&&(Nr=null),ni=0,Or=!1,25<=l)throw Error(M(301));if(l+=1,Xe=Se=null,e.updateQueue!=null){var r=e.updateQueue;r.lastEffect=null,r.events=null,r.stores=null,r.memoCache!=null&&(r.memoCache.index=0)}W.H=r1,r=t(a,n)}while(Or);return r}function US(){var e=W.H,t=e.useState()[0];return t=typeof t.then=="function"?xi(t):t,e=e.useState()[0],(Se!==null?Se.memoizedState:null)!==e&&(le.flags|=1024),t}function sp(){var e=cs!==0;return cs=0,e}function cp(e,t,a){t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~a}function fp(e){if(ss){for(e=e.memoizedState;e!==null;){var t=e.queue;t!==null&&(t.pending=null),e=e.next}ss=!1}on=0,Xe=Se=le=null,Or=!1,ni=cs=0,Nr=null}function Ct(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return Xe===null?le.memoizedState=Xe=e:Xe=Xe.next=e,Xe}function _e(){if(Se===null){var e=le.alternate;e=e!==null?e.memoizedState:null}else e=Se.next;var t=Xe===null?le.memoizedState:Xe.next;if(t!==null)Xe=t,Se=e;else{if(e===null)throw le.alternate===null?Error(M(467)):Error(M(310));Se=e,e={memoizedState:Se.memoizedState,baseState:Se.baseState,baseQueue:Se.baseQueue,queue:Se.queue,next:null},Xe===null?le.memoizedState=Xe=e:Xe=Xe.next=e}return Xe}function Bs(){return{lastEffect:null,events:null,stores:null,memoCache:null}}function xi(e){var t=ni;return ni+=1,Nr===null&&(Nr=[]),e=Cy(Nr,e,t),t=le,(Xe===null?t.memoizedState:Xe.next)===null&&(t=t.alternate,W.H=t===null||t.memoizedState===null?l1:Lp),e}function Rs(e){if(e!==null&&typeof e=="object"){if(typeof e.then=="function")return xi(e);if(e.$$typeof===$a)return ct(e)}throw Error(M(438,String(e)))}function dp(e){var t=null,a=le.updateQueue;if(a!==null&&(t=a.memoCache),t==null){var n=le.alternate;n!==null&&(n=n.updateQueue,n!==null&&(n=n.memoCache,n!=null&&(t={data:n.data.map(function(l){return l.slice()}),index:0})))}if(t==null&&(t={data:[],index:0}),a===null&&(a=Bs(),le.updateQueue=a),a.memoCache=t,a=t.data[t.index],a===void 0)for(a=t.data[t.index]=Array(e),n=0;n<e;n++)a[n]=SC;return t.index++,a}function un(e,t){return typeof t=="function"?t(e):t}function _u(e){var t=_e();return pp(t,Se,e)}function pp(e,t,a){var n=e.queue;if(n===null)throw Error(M(311));n.lastRenderedReducer=a;var l=e.baseQueue,r=n.pending;if(r!==null){if(l!==null){var o=l.next;l.next=r.next,r.next=o}t.baseQueue=l=r,n.pending=null}if(r=e.baseState,l===null)e.memoizedState=r;else{t=l.next;var i=o=null,u=null,c=t,s=!1;do{var f=c.lane&-536870913;if(f!==c.lane?(fe&f)===f:(on&f)===f){var d=c.revertLane;if(d===0)u!==null&&(u=u.next={lane:0,revertLane:0,gesture:null,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null}),f===Fr&&(s=!0);else if((on&d)===d){c=c.next,d===Fr&&(s=!0);continue}else f={lane:0,revertLane:c.revertLane,gesture:null,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null},u===null?(i=u=f,o=r):u=u.next=f,le.lanes|=d,Yn|=d;f=c.action,Il&&a(r,f),r=c.hasEagerState?c.eagerState:a(r,f)}else d={lane:f,revertLane:c.revertLane,gesture:c.gesture,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null},u===null?(i=u=d,o=r):u=u.next=d,le.lanes|=f,Yn|=f;c=c.next}while(c!==null&&c!==t);if(u===null?o=r:u.next=i,!Yt(r,e.memoizedState)&&(Ke=!0,s&&(a=Br,a!==null)))throw a;e.memoizedState=r,e.baseState=o,e.baseQueue=u,n.lastRenderedState=r}return l===null&&(n.lanes=0),[e.memoizedState,n.dispatch]}function If(e){var t=_e(),a=t.queue;if(a===null)throw Error(M(311));a.lastRenderedReducer=e;var n=a.dispatch,l=a.pending,r=t.memoizedState;if(l!==null){a.pending=null;var o=l=l.next;do r=e(r,o.action),o=o.next;while(o!==l);Yt(r,t.memoizedState)||(Ke=!0),t.memoizedState=r,t.baseQueue===null&&(t.baseState=r),a.lastRenderedState=r}return[r,n]}function My(e,t,a){var n=le,l=_e(),r=pe;if(r){if(a===void 0)throw Error(M(407));a=a()}else a=t();var o=!Yt((Se||l).memoizedState,a);if(o&&(l.memoizedState=a,Ke=!0),l=l.queue,mp(By.bind(null,n,l,e),[e]),l.getSnapshot!==t||o||Xe!==null&&Xe.memoizedState.tag&1){if(n.flags|=2048,_r(9,{destroy:void 0},zy.bind(null,n,l,a,t),null),we===null)throw Error(M(349));r||(on&127)!==0||Ey(n,t,a)}return a}function Ey(e,t,a){e.flags|=16384,e={getSnapshot:t,value:a},t=le.updateQueue,t===null?(t=Bs(),le.updateQueue=t,t.stores=[e]):(a=t.stores,a===null?t.stores=[e]:a.push(e))}function zy(e,t,a,n){t.value=a,t.getSnapshot=n,Ry(t)&&Oy(e)}function By(e,t,a){return a(function(){Ry(t)&&Oy(e)})}function Ry(e){var t=e.getSnapshot;e=e.value;try{var a=t();return!Yt(e,a)}catch{return!0}}function Oy(e){var t=El(e,2);t!==null&&Mt(t,e,2)}function gd(e){var t=Ct();if(typeof e=="function"){var a=e;if(e=a(),Il){En(!0);try{a()}finally{En(!1)}}}return t.memoizedState=t.baseState=e,t.queue={pending:null,lanes:0,dispatch:null,lastRenderedReducer:un,lastRenderedState:e},t}function Ny(e,t,a,n){return e.baseState=a,pp(e,Se,typeof n=="function"?n:un)}function PS(e,t,a,n,l){if(Ns(e))throw Error(M(485));if(e=t.action,e!==null){var r={payload:l,action:e,next:null,isTransition:!0,status:"pending",value:null,reason:null,listeners:[],then:function(o){r.listeners.push(o)}};W.T!==null?a(!0):r.isTransition=!1,n(r),a=t.pending,a===null?(r.next=t.pending=r,qy(t,r)):(r.next=a.next,t.pending=a.next=r)}}function qy(e,t){var a=t.action,n=t.payload,l=e.state;if(t.isTransition){var r=W.T,o={};W.T=o;try{var i=a(l,n),u=W.S;u!==null&&u(o,i),Ng(e,t,i)}catch(c){xd(e,t,c)}finally{r!==null&&o.types!==null&&(r.types=o.types),W.T=r}}else try{r=a(l,n),Ng(e,t,r)}catch(c){xd(e,t,c)}}function Ng(e,t,a){a!==null&&typeof a=="object"&&typeof a.then=="function"?a.then(function(n){qg(e,t,n)},function(n){return xd(e,t,n)}):qg(e,t,a)}function qg(e,t,a){t.status="fulfilled",t.value=a,Uy(t),e.state=a,t=e.pending,t!==null&&(a=t.next,a===t?e.pending=null:(a=a.next,t.next=a,qy(e,a)))}function xd(e,t,a){var n=e.pending;if(e.pending=null,n!==null){n=n.next;do t.status="rejected",t.reason=a,Uy(t),t=t.next;while(t!==n)}e.action=null}function Uy(e){e=e.listeners;for(var t=0;t<e.length;t++)(0,e[t])()}function Py(e,t){return t}function Ug(e,t){if(pe){var a=we.formState;if(a!==null){e:{var n=le;if(pe){if(De){t:{for(var l=De,r=ra;l.nodeType!==8;){if(!r){l=null;break t}if(l=ia(l.nextSibling),l===null){l=null;break t}}r=l.data,l=r==="F!"||r==="F"?l:null}if(l){De=ia(l.nextSibling),n=l.data==="F!";break e}}Xn(n)}n=!1}n&&(t=a[0])}}return a=Ct(),a.memoizedState=a.baseState=t,n={pending:null,lanes:0,dispatch:null,lastRenderedReducer:Py,lastRenderedState:t},a.queue=n,a=t1.bind(null,le,n),n.dispatch=a,n=gd(!1),r=yp.bind(null,le,!1,n.queue),n=Ct(),l={state:t,dispatch:null,action:e,pending:null},n.queue=l,a=PS.bind(null,le,l,r,a),l.dispatch=a,n.memoizedState=e,[t,a,!1]}function Pg(e){var t=_e();return Fy(t,Se,e)}function Fy(e,t,a){if(t=pp(e,t,Py)[0],e=_u(un)[0],typeof t=="object"&&t!==null&&typeof t.then=="function")try{var n=xi(t)}catch(o){throw o===Jr?zs:o}else n=t;t=_e();var l=t.queue,r=l.dispatch;return a!==t.memoizedState&&(le.flags|=2048,_r(9,{destroy:void 0},FS.bind(null,l,a),null)),[n,r,e]}function FS(e,t){e.action=t}function Fg(e){var t=_e(),a=Se;if(a!==null)return Fy(t,a,e);_e(),t=t.memoizedState,a=_e();var n=a.queue.dispatch;return a.memoizedState=e,[t,n,!1]}function _r(e,t,a,n){return e={tag:e,create:a,deps:n,inst:t,next:null},t=le.updateQueue,t===null&&(t=Bs(),le.updateQueue=t),a=t.lastEffect,a===null?t.lastEffect=e.next=e:(n=a.next,a.next=e,e.next=n,t.lastEffect=e),e}function Hy(){return _e().memoizedState}function Gu(e,t,a,n){var l=Ct();le.flags|=e,l.memoizedState=_r(1|t,{destroy:void 0},a,n===void 0?null:n)}function Os(e,t,a,n){var l=_e();n=n===void 0?null:n;var r=l.memoizedState.inst;Se!==null&&n!==null&&ip(n,Se.memoizedState.deps)?l.memoizedState=_r(t,r,a,n):(le.flags|=e,l.memoizedState=_r(1|t,r,a,n))}function Hg(e,t){Gu(8390656,8,e,t)}function mp(e,t){Os(2048,8,e,t)}function HS(e){le.flags|=4;var t=le.updateQueue;if(t===null)t=Bs(),le.updateQueue=t,t.events=[e];else{var a=t.events;a===null?t.events=[e]:a.push(e)}}function _y(e){var t=_e().memoizedState;return HS({ref:t,nextImpl:e}),function(){if((ge&2)!==0)throw Error(M(440));return t.impl.apply(void 0,arguments)}}function Gy(e,t){return Os(4,2,e,t)}function Vy(e,t){return Os(4,4,e,t)}function jy(e,t){if(typeof t=="function"){e=e();var a=t(e);return function(){typeof a=="function"?a():t(null)}}if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function Xy(e,t,a){a=a!=null?a.concat([e]):null,Os(4,4,jy.bind(null,t,e),a)}function hp(){}function Qy(e,t){var a=_e();t=t===void 0?null:t;var n=a.memoizedState;return t!==null&&ip(t,n[1])?n[0]:(a.memoizedState=[e,t],e)}function Yy(e,t){var a=_e();t=t===void 0?null:t;var n=a.memoizedState;if(t!==null&&ip(t,n[1]))return n[0];if(n=e(),Il){En(!0);try{e()}finally{En(!1)}}return a.memoizedState=[n,t],n}function gp(e,t,a){return a===void 0||(on&1073741824)!==0&&(fe&261930)===0?e.memoizedState=t:(e.memoizedState=a,e=N1(),le.lanes|=e,Yn|=e,a)}function Ky(e,t,a,n){return Yt(a,t)?a:Hr.current!==null?(e=gp(e,a,n),Yt(e,t)||(Ke=!0),e):(on&42)===0||(on&1073741824)!==0&&(fe&261930)===0?(Ke=!0,e.memoizedState=a):(e=N1(),le.lanes|=e,Yn|=e,t)}function Zy(e,t,a,n,l){var r=xe.p;xe.p=r!==0&&8>r?r:8;var o=W.T,i={};W.T=i,yp(e,!1,t,a);try{var u=l(),c=W.S;if(c!==null&&c(i,u),u!==null&&typeof u=="object"&&typeof u.then=="function"){var s=NS(u,n);Vo(e,t,s,Qt(e))}else Vo(e,t,n,Qt(e))}catch(f){Vo(e,t,{then:function(){},status:"rejected",reason:f},Qt())}finally{xe.p=r,o!==null&&i.types!==null&&(o.types=i.types),W.T=o}}function _S(){}function yd(e,t,a,n){if(e.tag!==5)throw Error(M(476));var l=Jy(e).queue;Zy(e,l,t,yl,a===null?_S:function(){return Wy(e),a(n)})}function Jy(e){var t=e.memoizedState;if(t!==null)return t;t={memoizedState:yl,baseState:yl,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:un,lastRenderedState:yl},next:null};var a={};return t.next={memoizedState:a,baseState:a,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:un,lastRenderedState:a},next:null},e.memoizedState=t,e=e.alternate,e!==null&&(e.memoizedState=t),t}function Wy(e){var t=Jy(e);t.next===null&&(t=e.alternate.memoizedState),Vo(e,t.next.queue,{},Qt())}function xp(){return ct(ii)}function $y(){return _e().memoizedState}function e1(){return _e().memoizedState}function GS(e){for(var t=e.return;t!==null;){switch(t.tag){case 24:case 3:var a=Qt();e=Un(a);var n=Pn(t,e,a);n!==null&&(Mt(n,t,a),Ho(n,t,a)),t={cache:ap()},e.payload=t;return}t=t.return}}function VS(e,t,a){var n=Qt();a={lane:n,revertLane:0,gesture:null,action:a,hasEagerState:!1,eagerState:null,next:null},Ns(e)?a1(t,a):(a=Wd(e,t,a,n),a!==null&&(Mt(a,e,n),n1(a,t,n)))}function t1(e,t,a){var n=Qt();Vo(e,t,a,n)}function Vo(e,t,a,n){var l={lane:n,revertLane:0,gesture:null,action:a,hasEagerState:!1,eagerState:null,next:null};if(Ns(e))a1(t,l);else{var r=e.alternate;if(e.lanes===0&&(r===null||r.lanes===0)&&(r=t.lastRenderedReducer,r!==null))try{var o=t.lastRenderedState,i=r(o,a);if(l.hasEagerState=!0,l.eagerState=i,Yt(i,o))return Es(e,t,l,0),we===null&&Ms(),!1}catch{}finally{}if(a=Wd(e,t,l,n),a!==null)return Mt(a,e,n),n1(a,t,n),!0}return!1}function yp(e,t,a,n){if(n={lane:2,revertLane:Ap(),gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null},Ns(e)){if(t)throw Error(M(479))}else t=Wd(e,a,n,2),t!==null&&Mt(t,e,2)}function Ns(e){var t=e.alternate;return e===le||t!==null&&t===le}function a1(e,t){Or=ss=!0;var a=e.pending;a===null?t.next=t:(t.next=a.next,a.next=t),e.pending=t}function n1(e,t,a){if((a&4194048)!==0){var n=t.lanes;n&=e.pendingLanes,a|=n,t.lanes=a,_x(e,a)}}var li={readContext:ct,use:Rs,useCallback:Ne,useContext:Ne,useEffect:Ne,useImperativeHandle:Ne,useLayoutEffect:Ne,useInsertionEffect:Ne,useMemo:Ne,useReducer:Ne,useRef:Ne,useState:Ne,useDebugValue:Ne,useDeferredValue:Ne,useTransition:Ne,useSyncExternalStore:Ne,useId:Ne,useHostTransitionStatus:Ne,useFormState:Ne,useActionState:Ne,useOptimistic:Ne,useMemoCache:Ne,useCacheRefresh:Ne};li.useEffectEvent=Ne;var l1={readContext:ct,use:Rs,useCallback:function(e,t){return Ct().memoizedState=[e,t===void 0?null:t],e},useContext:ct,useEffect:Hg,useImperativeHandle:function(e,t,a){a=a!=null?a.concat([e]):null,Gu(4194308,4,jy.bind(null,t,e),a)},useLayoutEffect:function(e,t){return Gu(4194308,4,e,t)},useInsertionEffect:function(e,t){Gu(4,2,e,t)},useMemo:function(e,t){var a=Ct();t=t===void 0?null:t;var n=e();if(Il){En(!0);try{e()}finally{En(!1)}}return a.memoizedState=[n,t],n},useReducer:function(e,t,a){var n=Ct();if(a!==void 0){var l=a(t);if(Il){En(!0);try{a(t)}finally{En(!1)}}}else l=t;return n.memoizedState=n.baseState=l,e={pending:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:l},n.queue=e,e=e.dispatch=VS.bind(null,le,e),[n.memoizedState,e]},useRef:function(e){var t=Ct();return e={current:e},t.memoizedState=e},useState:function(e){e=gd(e);var t=e.queue,a=t1.bind(null,le,t);return t.dispatch=a,[e.memoizedState,a]},useDebugValue:hp,useDeferredValue:function(e,t){var a=Ct();return gp(a,e,t)},useTransition:function(){var e=gd(!1);return e=Zy.bind(null,le,e.queue,!0,!1),Ct().memoizedState=e,[!1,e]},useSyncExternalStore:function(e,t,a){var n=le,l=Ct();if(pe){if(a===void 0)throw Error(M(407));a=a()}else{if(a=t(),we===null)throw Error(M(349));(fe&127)!==0||Ey(n,t,a)}l.memoizedState=a;var r={value:a,getSnapshot:t};return l.queue=r,Hg(By.bind(null,n,r,e),[e]),n.flags|=2048,_r(9,{destroy:void 0},zy.bind(null,n,r,a,t),null),a},useId:function(){var e=Ct(),t=we.identifierPrefix;if(pe){var a=Aa,n=Ia;a=(n&~(1<<32-Xt(n)-1)).toString(32)+a,t="_"+t+"R_"+a,a=cs++,0<a&&(t+="H"+a.toString(32)),t+="_"}else a=qS++,t="_"+t+"r_"+a.toString(32)+"_";return e.memoizedState=t},useHostTransitionStatus:xp,useFormState:Ug,useActionState:Ug,useOptimistic:function(e){var t=Ct();t.memoizedState=t.baseState=e;var a={pending:null,lanes:0,dispatch:null,lastRenderedReducer:null,lastRenderedState:null};return t.queue=a,t=yp.bind(null,le,!0,a),a.dispatch=t,[e,t]},useMemoCache:dp,useCacheRefresh:function(){return Ct().memoizedState=GS.bind(null,le)},useEffectEvent:function(e){var t=Ct(),a={impl:e};return t.memoizedState=a,function(){if((ge&2)!==0)throw Error(M(440));return a.impl.apply(void 0,arguments)}}},Lp={readContext:ct,use:Rs,useCallback:Qy,useContext:ct,useEffect:mp,useImperativeHandle:Xy,useInsertionEffect:Gy,useLayoutEffect:Vy,useMemo:Yy,useReducer:_u,useRef:Hy,useState:function(){return _u(un)},useDebugValue:hp,useDeferredValue:function(e,t){var a=_e();return Ky(a,Se.memoizedState,e,t)},useTransition:function(){var e=_u(un)[0],t=_e().memoizedState;return[typeof e=="boolean"?e:xi(e),t]},useSyncExternalStore:My,useId:$y,useHostTransitionStatus:xp,useFormState:Pg,useActionState:Pg,useOptimistic:function(e,t){var a=_e();return Ny(a,Se,e,t)},useMemoCache:dp,useCacheRefresh:e1};Lp.useEffectEvent=_y;var r1={readContext:ct,use:Rs,useCallback:Qy,useContext:ct,useEffect:mp,useImperativeHandle:Xy,useInsertionEffect:Gy,useLayoutEffect:Vy,useMemo:Yy,useReducer:If,useRef:Hy,useState:function(){return If(un)},useDebugValue:hp,useDeferredValue:function(e,t){var a=_e();return Se===null?gp(a,e,t):Ky(a,Se.memoizedState,e,t)},useTransition:function(){var e=If(un)[0],t=_e().memoizedState;return[typeof e=="boolean"?e:xi(e),t]},useSyncExternalStore:My,useId:$y,useHostTransitionStatus:xp,useFormState:Fg,useActionState:Fg,useOptimistic:function(e,t){var a=_e();return Se!==null?Ny(a,Se,e,t):(a.baseState=e,[e,a.queue.dispatch])},useMemoCache:dp,useCacheRefresh:e1};r1.useEffectEvent=_y;function Af(e,t,a,n){t=e.memoizedState,a=a(n,t),a=a==null?t:Me({},t,a),e.memoizedState=a,e.lanes===0&&(e.updateQueue.baseState=a)}var Ld={enqueueSetState:function(e,t,a){e=e._reactInternals;var n=Qt(),l=Un(n);l.payload=t,a!=null&&(l.callback=a),t=Pn(e,l,n),t!==null&&(Mt(t,e,n),Ho(t,e,n))},enqueueReplaceState:function(e,t,a){e=e._reactInternals;var n=Qt(),l=Un(n);l.tag=1,l.payload=t,a!=null&&(l.callback=a),t=Pn(e,l,n),t!==null&&(Mt(t,e,n),Ho(t,e,n))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var a=Qt(),n=Un(a);n.tag=2,t!=null&&(n.callback=t),t=Pn(e,n,a),t!==null&&(Mt(t,e,a),Ho(t,e,a))}};function _g(e,t,a,n,l,r,o){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(n,r,o):t.prototype&&t.prototype.isPureReactComponent?!$o(a,n)||!$o(l,r):!0}function Gg(e,t,a,n){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(a,n),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(a,n),t.state!==e&&Ld.enqueueReplaceState(t,t.state,null)}function Al(e,t){var a=t;if("ref"in t){a={};for(var n in t)n!=="ref"&&(a[n]=t[n])}if(e=e.defaultProps){a===t&&(a=Me({},a));for(var l in e)a[l]===void 0&&(a[l]=e[l])}return a}function o1(e){as(e)}function i1(e){console.error(e)}function u1(e){as(e)}function fs(e,t){try{var a=e.onUncaughtError;a(t.value,{componentStack:t.stack})}catch(n){setTimeout(function(){throw n})}}function Vg(e,t,a){try{var n=e.onCaughtError;n(a.value,{componentStack:a.stack,errorBoundary:t.tag===1?t.stateNode:null})}catch(l){setTimeout(function(){throw l})}}function bd(e,t,a){return a=Un(a),a.tag=3,a.payload={element:null},a.callback=function(){fs(e,t)},a}function s1(e){return e=Un(e),e.tag=3,e}function c1(e,t,a,n){var l=a.type.getDerivedStateFromError;if(typeof l=="function"){var r=n.value;e.payload=function(){return l(r)},e.callback=function(){Vg(t,a,n)}}var o=a.stateNode;o!==null&&typeof o.componentDidCatch=="function"&&(e.callback=function(){Vg(t,a,n),typeof l!="function"&&(Fn===null?Fn=new Set([this]):Fn.add(this));var i=n.stack;this.componentDidCatch(n.value,{componentStack:i!==null?i:""})})}function jS(e,t,a,n,l){if(a.flags|=32768,n!==null&&typeof n=="object"&&typeof n.then=="function"){if(t=a.alternate,t!==null&&Zr(t,a,l,!0),a=Kt.current,a!==null){switch(a.tag){case 31:case 13:return oa===null?gs():a.alternate===null&&qe===0&&(qe=3),a.flags&=-257,a.flags|=65536,a.lanes=l,n===os?a.flags|=16384:(t=a.updateQueue,t===null?a.updateQueue=new Set([n]):t.add(n),Uf(e,n,l)),!1;case 22:return a.flags|=65536,n===os?a.flags|=16384:(t=a.updateQueue,t===null?(t={transitions:null,markerInstances:null,retryQueue:new Set([n])},a.updateQueue=t):(a=t.retryQueue,a===null?t.retryQueue=new Set([n]):a.add(n)),Uf(e,n,l)),!1}throw Error(M(435,a.tag))}return Uf(e,n,l),gs(),!1}if(pe)return t=Kt.current,t!==null?((t.flags&65536)===0&&(t.flags|=256),t.flags|=65536,t.lanes=l,n!==id&&(e=Error(M(422),{cause:n}),ti(la(e,a)))):(n!==id&&(t=Error(M(423),{cause:n}),ti(la(t,a))),e=e.current.alternate,e.flags|=65536,l&=-l,e.lanes|=l,n=la(n,a),l=bd(e.stateNode,n,l),wf(e,l),qe!==4&&(qe=2)),!1;var r=Error(M(520),{cause:n});if(r=la(r,a),Qo===null?Qo=[r]:Qo.push(r),qe!==4&&(qe=2),t===null)return!0;n=la(n,a),a=t;do{switch(a.tag){case 3:return a.flags|=65536,e=l&-l,a.lanes|=e,e=bd(a.stateNode,n,e),wf(a,e),!1;case 1:if(t=a.type,r=a.stateNode,(a.flags&128)===0&&(typeof t.getDerivedStateFromError=="function"||r!==null&&typeof r.componentDidCatch=="function"&&(Fn===null||!Fn.has(r))))return a.flags|=65536,l&=-l,a.lanes|=l,l=s1(l),c1(l,e,a,n),wf(a,l),!1}a=a.return}while(a!==null);return!1}var bp=Error(M(461)),Ke=!1;function it(e,t,a,n){t.child=e===null?ky(t,null,a,n):wl(t,e.child,a,n)}function jg(e,t,a,n,l){a=a.render;var r=t.ref;if("ref"in n){var o={};for(var i in n)i!=="ref"&&(o[i]=n[i])}else o=n;return kl(t),n=up(e,t,a,o,r,l),i=sp(),e!==null&&!Ke?(cp(e,t,l),sn(e,t,l)):(pe&&i&&ep(t),t.flags|=1,it(e,t,n,l),t.child)}function Xg(e,t,a,n,l){if(e===null){var r=a.type;return typeof r=="function"&&!$d(r)&&r.defaultProps===void 0&&a.compare===null?(t.tag=15,t.type=r,f1(e,t,r,n,l)):(e=Fu(a.type,null,n,t,t.mode,l),e.ref=t.ref,e.return=t,t.child=e)}if(r=e.child,!vp(e,l)){var o=r.memoizedProps;if(a=a.compare,a=a!==null?a:$o,a(o,n)&&e.ref===t.ref)return sn(e,t,l)}return t.flags|=1,e=an(r,n),e.ref=t.ref,e.return=t,t.child=e}function f1(e,t,a,n,l){if(e!==null){var r=e.memoizedProps;if($o(r,n)&&e.ref===t.ref)if(Ke=!1,t.pendingProps=n=r,vp(e,l))(e.flags&131072)!==0&&(Ke=!0);else return t.lanes=e.lanes,sn(e,t,l)}return vd(e,t,a,n,l)}function d1(e,t,a,n){var l=n.children,r=e!==null?e.memoizedState:null;if(e===null&&t.stateNode===null&&(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),n.mode==="hidden"){if((t.flags&128)!==0){if(r=r!==null?r.baseLanes|a:a,e!==null){for(n=t.child=e.child,l=0;n!==null;)l=l|n.lanes|n.childLanes,n=n.sibling;n=l&~r}else n=0,t.child=null;return Qg(e,t,r,a,n)}if((a&536870912)!==0)t.memoizedState={baseLanes:0,cachePool:null},e!==null&&Hu(t,r!==null?r.cachePool:null),r!==null?Og(t,r):md(),Ay(t);else return n=t.lanes=536870912,Qg(e,t,r!==null?r.baseLanes|a:a,a,n)}else r!==null?(Hu(t,r.cachePool),Og(t,r),Dn(t),t.memoizedState=null):(e!==null&&Hu(t,null),md(),Dn(t));return it(e,t,l,a),t.child}function Oo(e,t){return e!==null&&e.tag===22||t.stateNode!==null||(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),t.sibling}function Qg(e,t,a,n,l){var r=np();return r=r===null?null:{parent:Ye._currentValue,pool:r},t.memoizedState={baseLanes:a,cachePool:r},e!==null&&Hu(t,null),md(),Ay(t),e!==null&&Zr(e,t,n,!0),t.childLanes=l,null}function Vu(e,t){return t=ds({mode:t.mode,children:t.children},e.mode),t.ref=e.ref,e.child=t,t.return=e,t}function Yg(e,t,a){return wl(t,e.child,null,a),e=Vu(t,t.pendingProps),e.flags|=2,Ht(t),t.memoizedState=null,e}function XS(e,t,a){var n=t.pendingProps,l=(t.flags&128)!==0;if(t.flags&=-129,e===null){if(pe){if(n.mode==="hidden")return e=Vu(t,n),t.lanes=536870912,Oo(null,e);if(hd(t),(e=De)?(e=lL(e,ra),e=e!==null&&e.data==="&"?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:jn!==null?{id:Ia,overflow:Aa}:null,retryLane:536870912,hydrationErrors:null},a=xy(e),a.return=t,t.child=a,st=t,De=null)):e=null,e===null)throw Xn(t);return t.lanes=536870912,null}return Vu(t,n)}var r=e.memoizedState;if(r!==null){var o=r.dehydrated;if(hd(t),l)if(t.flags&256)t.flags&=-257,t=Yg(e,t,a);else if(t.memoizedState!==null)t.child=e.child,t.flags|=128,t=null;else throw Error(M(558));else if(Ke||Zr(e,t,a,!1),l=(a&e.childLanes)!==0,Ke||l){if(n=we,n!==null&&(o=Gx(n,a),o!==0&&o!==r.retryLane))throw r.retryLane=o,El(e,o),Mt(n,e,o),bp;gs(),t=Yg(e,t,a)}else e=r.treeContext,De=ia(o.nextSibling),st=t,pe=!0,qn=null,ra=!1,e!==null&&Ly(t,e),t=Vu(t,n),t.flags|=4096;return t}return e=an(e.child,{mode:n.mode,children:n.children}),e.ref=t.ref,t.child=e,e.return=t,e}function ju(e,t){var a=t.ref;if(a===null)e!==null&&e.ref!==null&&(t.flags|=4194816);else{if(typeof a!="function"&&typeof a!="object")throw Error(M(284));(e===null||e.ref!==a)&&(t.flags|=4194816)}}function vd(e,t,a,n,l){return kl(t),a=up(e,t,a,n,void 0,l),n=sp(),e!==null&&!Ke?(cp(e,t,l),sn(e,t,l)):(pe&&n&&ep(t),t.flags|=1,it(e,t,a,l),t.child)}function Kg(e,t,a,n,l,r){return kl(t),t.updateQueue=null,a=Dy(t,n,a,l),Ty(e),n=sp(),e!==null&&!Ke?(cp(e,t,r),sn(e,t,r)):(pe&&n&&ep(t),t.flags|=1,it(e,t,a,r),t.child)}function Zg(e,t,a,n,l){if(kl(t),t.stateNode===null){var r=Ir,o=a.contextType;typeof o=="object"&&o!==null&&(r=ct(o)),r=new a(n,r),t.memoizedState=r.state!==null&&r.state!==void 0?r.state:null,r.updater=Ld,t.stateNode=r,r._reactInternals=t,r=t.stateNode,r.props=n,r.state=t.memoizedState,r.refs={},rp(t),o=a.contextType,r.context=typeof o=="object"&&o!==null?ct(o):Ir,r.state=t.memoizedState,o=a.getDerivedStateFromProps,typeof o=="function"&&(Af(t,a,o,n),r.state=t.memoizedState),typeof a.getDerivedStateFromProps=="function"||typeof r.getSnapshotBeforeUpdate=="function"||typeof r.UNSAFE_componentWillMount!="function"&&typeof r.componentWillMount!="function"||(o=r.state,typeof r.componentWillMount=="function"&&r.componentWillMount(),typeof r.UNSAFE_componentWillMount=="function"&&r.UNSAFE_componentWillMount(),o!==r.state&&Ld.enqueueReplaceState(r,r.state,null),Go(t,n,r,l),_o(),r.state=t.memoizedState),typeof r.componentDidMount=="function"&&(t.flags|=4194308),n=!0}else if(e===null){r=t.stateNode;var i=t.memoizedProps,u=Al(a,i);r.props=u;var c=r.context,s=a.contextType;o=Ir,typeof s=="object"&&s!==null&&(o=ct(s));var f=a.getDerivedStateFromProps;s=typeof f=="function"||typeof r.getSnapshotBeforeUpdate=="function",i=t.pendingProps!==i,s||typeof r.UNSAFE_componentWillReceiveProps!="function"&&typeof r.componentWillReceiveProps!="function"||(i||c!==o)&&Gg(t,r,n,o),In=!1;var d=t.memoizedState;r.state=d,Go(t,n,r,l),_o(),c=t.memoizedState,i||d!==c||In?(typeof f=="function"&&(Af(t,a,f,n),c=t.memoizedState),(u=In||_g(t,a,u,n,d,c,o))?(s||typeof r.UNSAFE_componentWillMount!="function"&&typeof r.componentWillMount!="function"||(typeof r.componentWillMount=="function"&&r.componentWillMount(),typeof r.UNSAFE_componentWillMount=="function"&&r.UNSAFE_componentWillMount()),typeof r.componentDidMount=="function"&&(t.flags|=4194308)):(typeof r.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=n,t.memoizedState=c),r.props=n,r.state=c,r.context=o,n=u):(typeof r.componentDidMount=="function"&&(t.flags|=4194308),n=!1)}else{r=t.stateNode,dd(e,t),o=t.memoizedProps,s=Al(a,o),r.props=s,f=t.pendingProps,d=r.context,c=a.contextType,u=Ir,typeof c=="object"&&c!==null&&(u=ct(c)),i=a.getDerivedStateFromProps,(c=typeof i=="function"||typeof r.getSnapshotBeforeUpdate=="function")||typeof r.UNSAFE_componentWillReceiveProps!="function"&&typeof r.componentWillReceiveProps!="function"||(o!==f||d!==u)&&Gg(t,r,n,u),In=!1,d=t.memoizedState,r.state=d,Go(t,n,r,l),_o();var p=t.memoizedState;o!==f||d!==p||In||e!==null&&e.dependencies!==null&&rs(e.dependencies)?(typeof i=="function"&&(Af(t,a,i,n),p=t.memoizedState),(s=In||_g(t,a,s,n,d,p,u)||e!==null&&e.dependencies!==null&&rs(e.dependencies))?(c||typeof r.UNSAFE_componentWillUpdate!="function"&&typeof r.componentWillUpdate!="function"||(typeof r.componentWillUpdate=="function"&&r.componentWillUpdate(n,p,u),typeof r.UNSAFE_componentWillUpdate=="function"&&r.UNSAFE_componentWillUpdate(n,p,u)),typeof r.componentDidUpdate=="function"&&(t.flags|=4),typeof r.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof r.componentDidUpdate!="function"||o===e.memoizedProps&&d===e.memoizedState||(t.flags|=4),typeof r.getSnapshotBeforeUpdate!="function"||o===e.memoizedProps&&d===e.memoizedState||(t.flags|=1024),t.memoizedProps=n,t.memoizedState=p),r.props=n,r.state=p,r.context=u,n=s):(typeof r.componentDidUpdate!="function"||o===e.memoizedProps&&d===e.memoizedState||(t.flags|=4),typeof r.getSnapshotBeforeUpdate!="function"||o===e.memoizedProps&&d===e.memoizedState||(t.flags|=1024),n=!1)}return r=n,ju(e,t),n=(t.flags&128)!==0,r||n?(r=t.stateNode,a=n&&typeof a.getDerivedStateFromError!="function"?null:r.render(),t.flags|=1,e!==null&&n?(t.child=wl(t,e.child,null,l),t.child=wl(t,null,a,l)):it(e,t,a,l),t.memoizedState=r.state,e=t.child):e=sn(e,t,l),e}function Jg(e,t,a,n){return Sl(),t.flags|=256,it(e,t,a,n),t.child}var Tf={dehydrated:null,treeContext:null,retryLane:0,hydrationErrors:null};function Df(e){return{baseLanes:e,cachePool:vy()}}function Mf(e,t,a){return e=e!==null?e.childLanes&~a:0,t&&(e|=Gt),e}function p1(e,t,a){var n=t.pendingProps,l=!1,r=(t.flags&128)!==0,o;if((o=r)||(o=e!==null&&e.memoizedState===null?!1:(He.current&2)!==0),o&&(l=!0,t.flags&=-129),o=(t.flags&32)!==0,t.flags&=-33,e===null){if(pe){if(l?Tn(t):Dn(t),(e=De)?(e=lL(e,ra),e=e!==null&&e.data!=="&"?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:jn!==null?{id:Ia,overflow:Aa}:null,retryLane:536870912,hydrationErrors:null},a=xy(e),a.return=t,t.child=a,st=t,De=null)):e=null,e===null)throw Xn(t);return Od(e)?t.lanes=32:t.lanes=536870912,null}var i=n.children;return n=n.fallback,l?(Dn(t),l=t.mode,i=ds({mode:"hidden",children:i},l),n=Ll(n,l,a,null),i.return=t,n.return=t,i.sibling=n,t.child=i,n=t.child,n.memoizedState=Df(a),n.childLanes=Mf(e,o,a),t.memoizedState=Tf,Oo(null,n)):(Tn(t),Cd(t,i))}var u=e.memoizedState;if(u!==null&&(i=u.dehydrated,i!==null)){if(r)t.flags&256?(Tn(t),t.flags&=-257,t=Ef(e,t,a)):t.memoizedState!==null?(Dn(t),t.child=e.child,t.flags|=128,t=null):(Dn(t),i=n.fallback,l=t.mode,n=ds({mode:"visible",children:n.children},l),i=Ll(i,l,a,null),i.flags|=2,n.return=t,i.return=t,n.sibling=i,t.child=n,wl(t,e.child,null,a),n=t.child,n.memoizedState=Df(a),n.childLanes=Mf(e,o,a),t.memoizedState=Tf,t=Oo(null,n));else if(Tn(t),Od(i)){if(o=i.nextSibling&&i.nextSibling.dataset,o)var c=o.dgst;o=c,n=Error(M(419)),n.stack="",n.digest=o,ti({value:n,source:null,stack:null}),t=Ef(e,t,a)}else if(Ke||Zr(e,t,a,!1),o=(a&e.childLanes)!==0,Ke||o){if(o=we,o!==null&&(n=Gx(o,a),n!==0&&n!==u.retryLane))throw u.retryLane=n,El(e,n),Mt(o,e,n),bp;Rd(i)||gs(),t=Ef(e,t,a)}else Rd(i)?(t.flags|=192,t.child=e.child,t=null):(e=u.treeContext,De=ia(i.nextSibling),st=t,pe=!0,qn=null,ra=!1,e!==null&&Ly(t,e),t=Cd(t,n.children),t.flags|=4096);return t}return l?(Dn(t),i=n.fallback,l=t.mode,u=e.child,c=u.sibling,n=an(u,{mode:"hidden",children:n.children}),n.subtreeFlags=u.subtreeFlags&65011712,c!==null?i=an(c,i):(i=Ll(i,l,a,null),i.flags|=2),i.return=t,n.return=t,n.sibling=i,t.child=n,Oo(null,n),n=t.child,i=e.child.memoizedState,i===null?i=Df(a):(l=i.cachePool,l!==null?(u=Ye._currentValue,l=l.parent!==u?{parent:u,pool:u}:l):l=vy(),i={baseLanes:i.baseLanes|a,cachePool:l}),n.memoizedState=i,n.childLanes=Mf(e,o,a),t.memoizedState=Tf,Oo(e.child,n)):(Tn(t),a=e.child,e=a.sibling,a=an(a,{mode:"visible",children:n.children}),a.return=t,a.sibling=null,e!==null&&(o=t.deletions,o===null?(t.deletions=[e],t.flags|=16):o.push(e)),t.child=a,t.memoizedState=null,a)}function Cd(e,t){return t=ds({mode:"visible",children:t},e.mode),t.return=e,e.child=t}function ds(e,t){return e=_t(22,e,null,t),e.lanes=0,e}function Ef(e,t,a){return wl(t,e.child,null,a),e=Cd(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function Wg(e,t,a){e.lanes|=t;var n=e.alternate;n!==null&&(n.lanes|=t),sd(e.return,t,a)}function zf(e,t,a,n,l,r){var o=e.memoizedState;o===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:n,tail:a,tailMode:l,treeForkCount:r}:(o.isBackwards=t,o.rendering=null,o.renderingStartTime=0,o.last=n,o.tail=a,o.tailMode=l,o.treeForkCount=r)}function m1(e,t,a){var n=t.pendingProps,l=n.revealOrder,r=n.tail;n=n.children;var o=He.current,i=(o&2)!==0;if(i?(o=o&1|2,t.flags|=128):o&=1,Ie(He,o),it(e,t,n,a),n=pe?ei:0,!i&&e!==null&&(e.flags&128)!==0)e:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&Wg(e,a,t);else if(e.tag===19)Wg(e,a,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break e;for(;e.sibling===null;){if(e.return===null||e.return===t)break e;e=e.return}e.sibling.return=e.return,e=e.sibling}switch(l){case"forwards":for(a=t.child,l=null;a!==null;)e=a.alternate,e!==null&&us(e)===null&&(l=a),a=a.sibling;a=l,a===null?(l=t.child,t.child=null):(l=a.sibling,a.sibling=null),zf(t,!1,l,a,r,n);break;case"backwards":case"unstable_legacy-backwards":for(a=null,l=t.child,t.child=null;l!==null;){if(e=l.alternate,e!==null&&us(e)===null){t.child=l;break}e=l.sibling,l.sibling=a,a=l,l=e}zf(t,!0,a,null,r,n);break;case"together":zf(t,!1,null,null,void 0,n);break;default:t.memoizedState=null}return t.child}function sn(e,t,a){if(e!==null&&(t.dependencies=e.dependencies),Yn|=t.lanes,(a&t.childLanes)===0)if(e!==null){if(Zr(e,t,a,!1),(a&t.childLanes)===0)return null}else return null;if(e!==null&&t.child!==e.child)throw Error(M(153));if(t.child!==null){for(e=t.child,a=an(e,e.pendingProps),t.child=a,a.return=t;e.sibling!==null;)e=e.sibling,a=a.sibling=an(e,e.pendingProps),a.return=t;a.sibling=null}return t.child}function vp(e,t){return(e.lanes&t)!==0?!0:(e=e.dependencies,!!(e!==null&&rs(e)))}function QS(e,t,a){switch(t.tag){case 3:Wu(t,t.stateNode.containerInfo),An(t,Ye,e.memoizedState.cache),Sl();break;case 27:case 5:Zf(t);break;case 4:Wu(t,t.stateNode.containerInfo);break;case 10:An(t,t.type,t.memoizedProps.value);break;case 31:if(t.memoizedState!==null)return t.flags|=128,hd(t),null;break;case 13:var n=t.memoizedState;if(n!==null)return n.dehydrated!==null?(Tn(t),t.flags|=128,null):(a&t.child.childLanes)!==0?p1(e,t,a):(Tn(t),e=sn(e,t,a),e!==null?e.sibling:null);Tn(t);break;case 19:var l=(e.flags&128)!==0;if(n=(a&t.childLanes)!==0,n||(Zr(e,t,a,!1),n=(a&t.childLanes)!==0),l){if(n)return m1(e,t,a);t.flags|=128}if(l=t.memoizedState,l!==null&&(l.rendering=null,l.tail=null,l.lastEffect=null),Ie(He,He.current),n)break;return null;case 22:return t.lanes=0,d1(e,t,a,t.pendingProps);case 24:An(t,Ye,e.memoizedState.cache)}return sn(e,t,a)}function h1(e,t,a){if(e!==null)if(e.memoizedProps!==t.pendingProps)Ke=!0;else{if(!vp(e,a)&&(t.flags&128)===0)return Ke=!1,QS(e,t,a);Ke=(e.flags&131072)!==0}else Ke=!1,pe&&(t.flags&1048576)!==0&&yy(t,ei,t.index);switch(t.lanes=0,t.tag){case 16:e:{var n=t.pendingProps;if(e=gl(t.elementType),t.type=e,typeof e=="function")$d(e)?(n=Al(e,n),t.tag=1,t=Zg(null,t,e,n,a)):(t.tag=0,t=vd(null,t,e,n,a));else{if(e!=null){var l=e.$$typeof;if(l===Pd){t.tag=11,t=jg(null,t,e,n,a);break e}else if(l===Fd){t.tag=14,t=Xg(null,t,e,n,a);break e}}throw t=Yf(e)||e,Error(M(306,t,""))}}return t;case 0:return vd(e,t,t.type,t.pendingProps,a);case 1:return n=t.type,l=Al(n,t.pendingProps),Zg(e,t,n,l,a);case 3:e:{if(Wu(t,t.stateNode.containerInfo),e===null)throw Error(M(387));n=t.pendingProps;var r=t.memoizedState;l=r.element,dd(e,t),Go(t,n,null,a);var o=t.memoizedState;if(n=o.cache,An(t,Ye,n),n!==r.cache&&cd(t,[Ye],a,!0),_o(),n=o.element,r.isDehydrated)if(r={element:n,isDehydrated:!1,cache:o.cache},t.updateQueue.baseState=r,t.memoizedState=r,t.flags&256){t=Jg(e,t,n,a);break e}else if(n!==l){l=la(Error(M(424)),t),ti(l),t=Jg(e,t,n,a);break e}else{switch(e=t.stateNode.containerInfo,e.nodeType){case 9:e=e.body;break;default:e=e.nodeName==="HTML"?e.ownerDocument.body:e}for(De=ia(e.firstChild),st=t,pe=!0,qn=null,ra=!0,a=ky(t,null,n,a),t.child=a;a;)a.flags=a.flags&-3|4096,a=a.sibling}else{if(Sl(),n===l){t=sn(e,t,a);break e}it(e,t,n,a)}t=t.child}return t;case 26:return ju(e,t),e===null?(a=bx(t.type,null,t.pendingProps,null))?t.memoizedState=a:pe||(a=t.type,e=t.pendingProps,n=bs(Nn.current).createElement(a),n[ut]=t,n[Et]=e,ft(n,a,e),tt(n),t.stateNode=n):t.memoizedState=bx(t.type,e.memoizedProps,t.pendingProps,e.memoizedState),null;case 27:return Zf(t),e===null&&pe&&(n=t.stateNode=rL(t.type,t.pendingProps,Nn.current),st=t,ra=!0,l=De,Zn(t.type)?(Nd=l,De=ia(n.firstChild)):De=l),it(e,t,t.pendingProps.children,a),ju(e,t),e===null&&(t.flags|=4194304),t.child;case 5:return e===null&&pe&&((l=n=De)&&(n=vk(n,t.type,t.pendingProps,ra),n!==null?(t.stateNode=n,st=t,De=ia(n.firstChild),ra=!1,l=!0):l=!1),l||Xn(t)),Zf(t),l=t.type,r=t.pendingProps,o=e!==null?e.memoizedProps:null,n=r.children,zd(l,r)?n=null:o!==null&&zd(l,o)&&(t.flags|=32),t.memoizedState!==null&&(l=up(e,t,US,null,null,a),ii._currentValue=l),ju(e,t),it(e,t,n,a),t.child;case 6:return e===null&&pe&&((e=a=De)&&(a=Ck(a,t.pendingProps,ra),a!==null?(t.stateNode=a,st=t,De=null,e=!0):e=!1),e||Xn(t)),null;case 13:return p1(e,t,a);case 4:return Wu(t,t.stateNode.containerInfo),n=t.pendingProps,e===null?t.child=wl(t,null,n,a):it(e,t,n,a),t.child;case 11:return jg(e,t,t.type,t.pendingProps,a);case 7:return it(e,t,t.pendingProps,a),t.child;case 8:return it(e,t,t.pendingProps.children,a),t.child;case 12:return it(e,t,t.pendingProps.children,a),t.child;case 10:return n=t.pendingProps,An(t,t.type,n.value),it(e,t,n.children,a),t.child;case 9:return l=t.type._context,n=t.pendingProps.children,kl(t),l=ct(l),n=n(l),t.flags|=1,it(e,t,n,a),t.child;case 14:return Xg(e,t,t.type,t.pendingProps,a);case 15:return f1(e,t,t.type,t.pendingProps,a);case 19:return m1(e,t,a);case 31:return XS(e,t,a);case 22:return d1(e,t,a,t.pendingProps);case 24:return kl(t),n=ct(Ye),e===null?(l=np(),l===null&&(l=we,r=ap(),l.pooledCache=r,r.refCount++,r!==null&&(l.pooledCacheLanes|=a),l=r),t.memoizedState={parent:n,cache:l},rp(t),An(t,Ye,l)):((e.lanes&a)!==0&&(dd(e,t),Go(t,null,null,a),_o()),l=e.memoizedState,r=t.memoizedState,l.parent!==n?(l={parent:n,cache:n},t.memoizedState=l,t.lanes===0&&(t.memoizedState=t.updateQueue.baseState=l),An(t,Ye,n)):(n=r.cache,An(t,Ye,n),n!==l.cache&&cd(t,[Ye],a,!0))),it(e,t,t.pendingProps.children,a),t.child;case 29:throw t.pendingProps}throw Error(M(156,t.tag))}function Qa(e){e.flags|=4}function Bf(e,t,a,n,l){if((t=(e.mode&32)!==0)&&(t=!1),t){if(e.flags|=16777216,(l&335544128)===l)if(e.stateNode.complete)e.flags|=8192;else if(P1())e.flags|=8192;else throw vl=os,lp}else e.flags&=-16777217}function $g(e,t){if(t.type!=="stylesheet"||(t.state.loading&4)!==0)e.flags&=-16777217;else if(e.flags|=16777216,!uL(t))if(P1())e.flags|=8192;else throw vl=os,lp}function Du(e,t){t!==null&&(e.flags|=4),e.flags&16384&&(t=e.tag!==22?Fx():536870912,e.lanes|=t,Gr|=t)}function To(e,t){if(!pe)switch(e.tailMode){case"hidden":t=e.tail;for(var a=null;t!==null;)t.alternate!==null&&(a=t),t=t.sibling;a===null?e.tail=null:a.sibling=null;break;case"collapsed":a=e.tail;for(var n=null;a!==null;)a.alternate!==null&&(n=a),a=a.sibling;n===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:n.sibling=null}}function Te(e){var t=e.alternate!==null&&e.alternate.child===e.child,a=0,n=0;if(t)for(var l=e.child;l!==null;)a|=l.lanes|l.childLanes,n|=l.subtreeFlags&65011712,n|=l.flags&65011712,l.return=e,l=l.sibling;else for(l=e.child;l!==null;)a|=l.lanes|l.childLanes,n|=l.subtreeFlags,n|=l.flags,l.return=e,l=l.sibling;return e.subtreeFlags|=n,e.childLanes=a,t}function YS(e,t,a){var n=t.pendingProps;switch(tp(t),t.tag){case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return Te(t),null;case 1:return Te(t),null;case 3:return a=t.stateNode,n=null,e!==null&&(n=e.memoizedState.cache),t.memoizedState.cache!==n&&(t.flags|=2048),nn(Ye),qr(),a.pendingContext&&(a.context=a.pendingContext,a.pendingContext=null),(e===null||e.child===null)&&(mr(t)?Qa(t):e===null||e.memoizedState.isDehydrated&&(t.flags&256)===0||(t.flags|=1024,kf())),Te(t),null;case 26:var l=t.type,r=t.memoizedState;return e===null?(Qa(t),r!==null?(Te(t),$g(t,r)):(Te(t),Bf(t,l,null,n,a))):r?r!==e.memoizedState?(Qa(t),Te(t),$g(t,r)):(Te(t),t.flags&=-16777217):(e=e.memoizedProps,e!==n&&Qa(t),Te(t),Bf(t,l,e,n,a)),null;case 27:if($u(t),a=Nn.current,l=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==n&&Qa(t);else{if(!n){if(t.stateNode===null)throw Error(M(166));return Te(t),null}e=Da.current,mr(t)?Tg(t,e):(e=rL(l,n,a),t.stateNode=e,Qa(t))}return Te(t),null;case 5:if($u(t),l=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==n&&Qa(t);else{if(!n){if(t.stateNode===null)throw Error(M(166));return Te(t),null}if(r=Da.current,mr(t))Tg(t,r);else{var o=bs(Nn.current);switch(r){case 1:r=o.createElementNS("http://www.w3.org/2000/svg",l);break;case 2:r=o.createElementNS("http://www.w3.org/1998/Math/MathML",l);break;default:switch(l){case"svg":r=o.createElementNS("http://www.w3.org/2000/svg",l);break;case"math":r=o.createElementNS("http://www.w3.org/1998/Math/MathML",l);break;case"script":r=o.createElement("div"),r.innerHTML="<script><\/script>",r=r.removeChild(r.firstChild);break;case"select":r=typeof n.is=="string"?o.createElement("select",{is:n.is}):o.createElement("select"),n.multiple?r.multiple=!0:n.size&&(r.size=n.size);break;default:r=typeof n.is=="string"?o.createElement(l,{is:n.is}):o.createElement(l)}}r[ut]=t,r[Et]=n;e:for(o=t.child;o!==null;){if(o.tag===5||o.tag===6)r.appendChild(o.stateNode);else if(o.tag!==4&&o.tag!==27&&o.child!==null){o.child.return=o,o=o.child;continue}if(o===t)break e;for(;o.sibling===null;){if(o.return===null||o.return===t)break e;o=o.return}o.sibling.return=o.return,o=o.sibling}t.stateNode=r;e:switch(ft(r,l,n),l){case"button":case"input":case"select":case"textarea":n=!!n.autoFocus;break e;case"img":n=!0;break e;default:n=!1}n&&Qa(t)}}return Te(t),Bf(t,t.type,e===null?null:e.memoizedProps,t.pendingProps,a),null;case 6:if(e&&t.stateNode!=null)e.memoizedProps!==n&&Qa(t);else{if(typeof n!="string"&&t.stateNode===null)throw Error(M(166));if(e=Nn.current,mr(t)){if(e=t.stateNode,a=t.memoizedProps,n=null,l=st,l!==null)switch(l.tag){case 27:case 5:n=l.memoizedProps}e[ut]=t,e=!!(e.nodeValue===a||n!==null&&n.suppressHydrationWarning===!0||tL(e.nodeValue,a)),e||Xn(t,!0)}else e=bs(e).createTextNode(n),e[ut]=t,t.stateNode=e}return Te(t),null;case 31:if(a=t.memoizedState,e===null||e.memoizedState!==null){if(n=mr(t),a!==null){if(e===null){if(!n)throw Error(M(318));if(e=t.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(M(557));e[ut]=t}else Sl(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;Te(t),e=!1}else a=kf(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=a),e=!0;if(!e)return t.flags&256?(Ht(t),t):(Ht(t),null);if((t.flags&128)!==0)throw Error(M(558))}return Te(t),null;case 13:if(n=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(l=mr(t),n!==null&&n.dehydrated!==null){if(e===null){if(!l)throw Error(M(318));if(l=t.memoizedState,l=l!==null?l.dehydrated:null,!l)throw Error(M(317));l[ut]=t}else Sl(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;Te(t),l=!1}else l=kf(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=l),l=!0;if(!l)return t.flags&256?(Ht(t),t):(Ht(t),null)}return Ht(t),(t.flags&128)!==0?(t.lanes=a,t):(a=n!==null,e=e!==null&&e.memoizedState!==null,a&&(n=t.child,l=null,n.alternate!==null&&n.alternate.memoizedState!==null&&n.alternate.memoizedState.cachePool!==null&&(l=n.alternate.memoizedState.cachePool.pool),r=null,n.memoizedState!==null&&n.memoizedState.cachePool!==null&&(r=n.memoizedState.cachePool.pool),r!==l&&(n.flags|=2048)),a!==e&&a&&(t.child.flags|=8192),Du(t,t.updateQueue),Te(t),null);case 4:return qr(),e===null&&Tp(t.stateNode.containerInfo),Te(t),null;case 10:return nn(t.type),Te(t),null;case 19:if(at(He),n=t.memoizedState,n===null)return Te(t),null;if(l=(t.flags&128)!==0,r=n.rendering,r===null)if(l)To(n,!1);else{if(qe!==0||e!==null&&(e.flags&128)!==0)for(e=t.child;e!==null;){if(r=us(e),r!==null){for(t.flags|=128,To(n,!1),e=r.updateQueue,t.updateQueue=e,Du(t,e),t.subtreeFlags=0,e=a,a=t.child;a!==null;)gy(a,e),a=a.sibling;return Ie(He,He.current&1|2),pe&&Ja(t,n.treeForkCount),t.child}e=e.sibling}n.tail!==null&&Vt()>ms&&(t.flags|=128,l=!0,To(n,!1),t.lanes=4194304)}else{if(!l)if(e=us(r),e!==null){if(t.flags|=128,l=!0,e=e.updateQueue,t.updateQueue=e,Du(t,e),To(n,!0),n.tail===null&&n.tailMode==="hidden"&&!r.alternate&&!pe)return Te(t),null}else 2*Vt()-n.renderingStartTime>ms&&a!==536870912&&(t.flags|=128,l=!0,To(n,!1),t.lanes=4194304);n.isBackwards?(r.sibling=t.child,t.child=r):(e=n.last,e!==null?e.sibling=r:t.child=r,n.last=r)}return n.tail!==null?(e=n.tail,n.rendering=e,n.tail=e.sibling,n.renderingStartTime=Vt(),e.sibling=null,a=He.current,Ie(He,l?a&1|2:a&1),pe&&Ja(t,n.treeForkCount),e):(Te(t),null);case 22:case 23:return Ht(t),op(),n=t.memoizedState!==null,e!==null?e.memoizedState!==null!==n&&(t.flags|=8192):n&&(t.flags|=8192),n?(a&536870912)!==0&&(t.flags&128)===0&&(Te(t),t.subtreeFlags&6&&(t.flags|=8192)):Te(t),a=t.updateQueue,a!==null&&Du(t,a.retryQueue),a=null,e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(a=e.memoizedState.cachePool.pool),n=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(n=t.memoizedState.cachePool.pool),n!==a&&(t.flags|=2048),e!==null&&at(bl),null;case 24:return a=null,e!==null&&(a=e.memoizedState.cache),t.memoizedState.cache!==a&&(t.flags|=2048),nn(Ye),Te(t),null;case 25:return null;case 30:return null}throw Error(M(156,t.tag))}function KS(e,t){switch(tp(t),t.tag){case 1:return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return nn(Ye),qr(),e=t.flags,(e&65536)!==0&&(e&128)===0?(t.flags=e&-65537|128,t):null;case 26:case 27:case 5:return $u(t),null;case 31:if(t.memoizedState!==null){if(Ht(t),t.alternate===null)throw Error(M(340));Sl()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 13:if(Ht(t),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(M(340));Sl()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return at(He),null;case 4:return qr(),null;case 10:return nn(t.type),null;case 22:case 23:return Ht(t),op(),e!==null&&at(bl),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 24:return nn(Ye),null;case 25:return null;default:return null}}function g1(e,t){switch(tp(t),t.tag){case 3:nn(Ye),qr();break;case 26:case 27:case 5:$u(t);break;case 4:qr();break;case 31:t.memoizedState!==null&&Ht(t);break;case 13:Ht(t);break;case 19:at(He);break;case 10:nn(t.type);break;case 22:case 23:Ht(t),op(),e!==null&&at(bl);break;case 24:nn(Ye)}}function yi(e,t){try{var a=t.updateQueue,n=a!==null?a.lastEffect:null;if(n!==null){var l=n.next;a=l;do{if((a.tag&e)===e){n=void 0;var r=a.create,o=a.inst;n=r(),o.destroy=n}a=a.next}while(a!==l)}}catch(i){ve(t,t.return,i)}}function Qn(e,t,a){try{var n=t.updateQueue,l=n!==null?n.lastEffect:null;if(l!==null){var r=l.next;n=r;do{if((n.tag&e)===e){var o=n.inst,i=o.destroy;if(i!==void 0){o.destroy=void 0,l=t;var u=a,c=i;try{c()}catch(s){ve(l,u,s)}}}n=n.next}while(n!==r)}}catch(s){ve(t,t.return,s)}}function x1(e){var t=e.updateQueue;if(t!==null){var a=e.stateNode;try{Iy(t,a)}catch(n){ve(e,e.return,n)}}}function y1(e,t,a){a.props=Al(e.type,e.memoizedProps),a.state=e.memoizedState;try{a.componentWillUnmount()}catch(n){ve(e,t,n)}}function jo(e,t){try{var a=e.ref;if(a!==null){switch(e.tag){case 26:case 27:case 5:var n=e.stateNode;break;case 30:n=e.stateNode;break;default:n=e.stateNode}typeof a=="function"?e.refCleanup=a(n):a.current=n}}catch(l){ve(e,t,l)}}function Ta(e,t){var a=e.ref,n=e.refCleanup;if(a!==null)if(typeof n=="function")try{n()}catch(l){ve(e,t,l)}finally{e.refCleanup=null,e=e.alternate,e!=null&&(e.refCleanup=null)}else if(typeof a=="function")try{a(null)}catch(l){ve(e,t,l)}else a.current=null}function L1(e){var t=e.type,a=e.memoizedProps,n=e.stateNode;try{e:switch(t){case"button":case"input":case"select":case"textarea":a.autoFocus&&n.focus();break e;case"img":a.src?n.src=a.src:a.srcSet&&(n.srcset=a.srcSet)}}catch(l){ve(e,e.return,l)}}function Rf(e,t,a){try{var n=e.stateNode;hk(n,e.type,a,t),n[Et]=t}catch(l){ve(e,e.return,l)}}function b1(e){return e.tag===5||e.tag===3||e.tag===26||e.tag===27&&Zn(e.type)||e.tag===4}function Of(e){e:for(;;){for(;e.sibling===null;){if(e.return===null||b1(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.tag===27&&Zn(e.type)||e.flags&2||e.child===null||e.tag===4)continue e;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function Sd(e,t,a){var n=e.tag;if(n===5||n===6)e=e.stateNode,t?(a.nodeType===9?a.body:a.nodeName==="HTML"?a.ownerDocument.body:a).insertBefore(e,t):(t=a.nodeType===9?a.body:a.nodeName==="HTML"?a.ownerDocument.body:a,t.appendChild(e),a=a._reactRootContainer,a!=null||t.onclick!==null||(t.onclick=en));else if(n!==4&&(n===27&&Zn(e.type)&&(a=e.stateNode,t=null),e=e.child,e!==null))for(Sd(e,t,a),e=e.sibling;e!==null;)Sd(e,t,a),e=e.sibling}function ps(e,t,a){var n=e.tag;if(n===5||n===6)e=e.stateNode,t?a.insertBefore(e,t):a.appendChild(e);else if(n!==4&&(n===27&&Zn(e.type)&&(a=e.stateNode),e=e.child,e!==null))for(ps(e,t,a),e=e.sibling;e!==null;)ps(e,t,a),e=e.sibling}function v1(e){var t=e.stateNode,a=e.memoizedProps;try{for(var n=e.type,l=t.attributes;l.length;)t.removeAttributeNode(l[0]);ft(t,n,a),t[ut]=e,t[Et]=a}catch(r){ve(e,e.return,r)}}var Wa=!1,Qe=!1,Nf=!1,ex=typeof WeakSet=="function"?WeakSet:Set,et=null;function ZS(e,t){if(e=e.containerInfo,Md=ks,e=uy(e),Zd(e)){if("selectionStart"in e)var a={start:e.selectionStart,end:e.selectionEnd};else e:{a=(a=e.ownerDocument)&&a.defaultView||window;var n=a.getSelection&&a.getSelection();if(n&&n.rangeCount!==0){a=n.anchorNode;var l=n.anchorOffset,r=n.focusNode;n=n.focusOffset;try{a.nodeType,r.nodeType}catch{a=null;break e}var o=0,i=-1,u=-1,c=0,s=0,f=e,d=null;t:for(;;){for(var p;f!==a||l!==0&&f.nodeType!==3||(i=o+l),f!==r||n!==0&&f.nodeType!==3||(u=o+n),f.nodeType===3&&(o+=f.nodeValue.length),(p=f.firstChild)!==null;)d=f,f=p;for(;;){if(f===e)break t;if(d===a&&++c===l&&(i=o),d===r&&++s===n&&(u=o),(p=f.nextSibling)!==null)break;f=d,d=f.parentNode}f=p}a=i===-1||u===-1?null:{start:i,end:u}}else a=null}a=a||{start:0,end:0}}else a=null;for(Ed={focusedElem:e,selectionRange:a},ks=!1,et=t;et!==null;)if(t=et,e=t.child,(t.subtreeFlags&1028)!==0&&e!==null)e.return=t,et=e;else for(;et!==null;){switch(t=et,r=t.alternate,e=t.flags,t.tag){case 0:if((e&4)!==0&&(e=t.updateQueue,e=e!==null?e.events:null,e!==null))for(a=0;a<e.length;a++)l=e[a],l.ref.impl=l.nextImpl;break;case 11:case 15:break;case 1:if((e&1024)!==0&&r!==null){e=void 0,a=t,l=r.memoizedProps,r=r.memoizedState,n=a.stateNode;try{var g=Al(a.type,l);e=n.getSnapshotBeforeUpdate(g,r),n.__reactInternalSnapshotBeforeUpdate=e}catch(y){ve(a,a.return,y)}}break;case 3:if((e&1024)!==0){if(e=t.stateNode.containerInfo,a=e.nodeType,a===9)Bd(e);else if(a===1)switch(e.nodeName){case"HEAD":case"HTML":case"BODY":Bd(e);break;default:e.textContent=""}}break;case 5:case 26:case 27:case 6:case 4:case 17:break;default:if((e&1024)!==0)throw Error(M(163))}if(e=t.sibling,e!==null){e.return=t.return,et=e;break}et=t.return}}function C1(e,t,a){var n=a.flags;switch(a.tag){case 0:case 11:case 15:Ka(e,a),n&4&&yi(5,a);break;case 1:if(Ka(e,a),n&4)if(e=a.stateNode,t===null)try{e.componentDidMount()}catch(o){ve(a,a.return,o)}else{var l=Al(a.type,t.memoizedProps);t=t.memoizedState;try{e.componentDidUpdate(l,t,e.__reactInternalSnapshotBeforeUpdate)}catch(o){ve(a,a.return,o)}}n&64&&x1(a),n&512&&jo(a,a.return);break;case 3:if(Ka(e,a),n&64&&(e=a.updateQueue,e!==null)){if(t=null,a.child!==null)switch(a.child.tag){case 27:case 5:t=a.child.stateNode;break;case 1:t=a.child.stateNode}try{Iy(e,t)}catch(o){ve(a,a.return,o)}}break;case 27:t===null&&n&4&&v1(a);case 26:case 5:Ka(e,a),t===null&&n&4&&L1(a),n&512&&jo(a,a.return);break;case 12:Ka(e,a);break;case 31:Ka(e,a),n&4&&w1(e,a);break;case 13:Ka(e,a),n&4&&I1(e,a),n&64&&(e=a.memoizedState,e!==null&&(e=e.dehydrated,e!==null&&(a=rk.bind(null,a),Sk(e,a))));break;case 22:if(n=a.memoizedState!==null||Wa,!n){t=t!==null&&t.memoizedState!==null||Qe,l=Wa;var r=Qe;Wa=n,(Qe=t)&&!r?Za(e,a,(a.subtreeFlags&8772)!==0):Ka(e,a),Wa=l,Qe=r}break;case 30:break;default:Ka(e,a)}}function S1(e){var t=e.alternate;t!==null&&(e.alternate=null,S1(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&Vd(t)),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}var Be=null,Tt=!1;function Ya(e,t,a){for(a=a.child;a!==null;)k1(e,t,a),a=a.sibling}function k1(e,t,a){if(jt&&typeof jt.onCommitFiberUnmount=="function")try{jt.onCommitFiberUnmount(fi,a)}catch{}switch(a.tag){case 26:Qe||Ta(a,t),Ya(e,t,a),a.memoizedState?a.memoizedState.count--:a.stateNode&&(a=a.stateNode,a.parentNode.removeChild(a));break;case 27:Qe||Ta(a,t);var n=Be,l=Tt;Zn(a.type)&&(Be=a.stateNode,Tt=!1),Ya(e,t,a),Ko(a.stateNode),Be=n,Tt=l;break;case 5:Qe||Ta(a,t);case 6:if(n=Be,l=Tt,Be=null,Ya(e,t,a),Be=n,Tt=l,Be!==null)if(Tt)try{(Be.nodeType===9?Be.body:Be.nodeName==="HTML"?Be.ownerDocument.body:Be).removeChild(a.stateNode)}catch(r){ve(a,t,r)}else try{Be.removeChild(a.stateNode)}catch(r){ve(a,t,r)}break;case 18:Be!==null&&(Tt?(e=Be,hx(e.nodeType===9?e.body:e.nodeName==="HTML"?e.ownerDocument.body:e,a.stateNode),Qr(e)):hx(Be,a.stateNode));break;case 4:n=Be,l=Tt,Be=a.stateNode.containerInfo,Tt=!0,Ya(e,t,a),Be=n,Tt=l;break;case 0:case 11:case 14:case 15:Qn(2,a,t),Qe||Qn(4,a,t),Ya(e,t,a);break;case 1:Qe||(Ta(a,t),n=a.stateNode,typeof n.componentWillUnmount=="function"&&y1(a,t,n)),Ya(e,t,a);break;case 21:Ya(e,t,a);break;case 22:Qe=(n=Qe)||a.memoizedState!==null,Ya(e,t,a),Qe=n;break;default:Ya(e,t,a)}}function w1(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null))){e=e.dehydrated;try{Qr(e)}catch(a){ve(t,t.return,a)}}}function I1(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null&&(e=e.dehydrated,e!==null))))try{Qr(e)}catch(a){ve(t,t.return,a)}}function JS(e){switch(e.tag){case 31:case 13:case 19:var t=e.stateNode;return t===null&&(t=e.stateNode=new ex),t;case 22:return e=e.stateNode,t=e._retryCache,t===null&&(t=e._retryCache=new ex),t;default:throw Error(M(435,e.tag))}}function Mu(e,t){var a=JS(e);t.forEach(function(n){if(!a.has(n)){a.add(n);var l=ok.bind(null,e,n);n.then(l,l)}})}function It(e,t){var a=t.deletions;if(a!==null)for(var n=0;n<a.length;n++){var l=a[n],r=e,o=t,i=o;e:for(;i!==null;){switch(i.tag){case 27:if(Zn(i.type)){Be=i.stateNode,Tt=!1;break e}break;case 5:Be=i.stateNode,Tt=!1;break e;case 3:case 4:Be=i.stateNode.containerInfo,Tt=!0;break e}i=i.return}if(Be===null)throw Error(M(160));k1(r,o,l),Be=null,Tt=!1,r=l.alternate,r!==null&&(r.return=null),l.return=null}if(t.subtreeFlags&13886)for(t=t.child;t!==null;)A1(t,e),t=t.sibling}var La=null;function A1(e,t){var a=e.alternate,n=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:It(t,e),At(e),n&4&&(Qn(3,e,e.return),yi(3,e),Qn(5,e,e.return));break;case 1:It(t,e),At(e),n&512&&(Qe||a===null||Ta(a,a.return)),n&64&&Wa&&(e=e.updateQueue,e!==null&&(n=e.callbacks,n!==null&&(a=e.shared.hiddenCallbacks,e.shared.hiddenCallbacks=a===null?n:a.concat(n))));break;case 26:var l=La;if(It(t,e),At(e),n&512&&(Qe||a===null||Ta(a,a.return)),n&4){var r=a!==null?a.memoizedState:null;if(n=e.memoizedState,a===null)if(n===null)if(e.stateNode===null){e:{n=e.type,a=e.memoizedProps,l=l.ownerDocument||l;t:switch(n){case"title":r=l.getElementsByTagName("title")[0],(!r||r[mi]||r[ut]||r.namespaceURI==="http://www.w3.org/2000/svg"||r.hasAttribute("itemprop"))&&(r=l.createElement(n),l.head.insertBefore(r,l.querySelector("head > title"))),ft(r,n,a),r[ut]=e,tt(r),n=r;break e;case"link":var o=Cx("link","href",l).get(n+(a.href||""));if(o){for(var i=0;i<o.length;i++)if(r=o[i],r.getAttribute("href")===(a.href==null||a.href===""?null:a.href)&&r.getAttribute("rel")===(a.rel==null?null:a.rel)&&r.getAttribute("title")===(a.title==null?null:a.title)&&r.getAttribute("crossorigin")===(a.crossOrigin==null?null:a.crossOrigin)){o.splice(i,1);break t}}r=l.createElement(n),ft(r,n,a),l.head.appendChild(r);break;case"meta":if(o=Cx("meta","content",l).get(n+(a.content||""))){for(i=0;i<o.length;i++)if(r=o[i],r.getAttribute("content")===(a.content==null?null:""+a.content)&&r.getAttribute("name")===(a.name==null?null:a.name)&&r.getAttribute("property")===(a.property==null?null:a.property)&&r.getAttribute("http-equiv")===(a.httpEquiv==null?null:a.httpEquiv)&&r.getAttribute("charset")===(a.charSet==null?null:a.charSet)){o.splice(i,1);break t}}r=l.createElement(n),ft(r,n,a),l.head.appendChild(r);break;default:throw Error(M(468,n))}r[ut]=e,tt(r),n=r}e.stateNode=n}else Sx(l,e.type,e.stateNode);else e.stateNode=vx(l,n,e.memoizedProps);else r!==n?(r===null?a.stateNode!==null&&(a=a.stateNode,a.parentNode.removeChild(a)):r.count--,n===null?Sx(l,e.type,e.stateNode):vx(l,n,e.memoizedProps)):n===null&&e.stateNode!==null&&Rf(e,e.memoizedProps,a.memoizedProps)}break;case 27:It(t,e),At(e),n&512&&(Qe||a===null||Ta(a,a.return)),a!==null&&n&4&&Rf(e,e.memoizedProps,a.memoizedProps);break;case 5:if(It(t,e),At(e),n&512&&(Qe||a===null||Ta(a,a.return)),e.flags&32){l=e.stateNode;try{Pr(l,"")}catch(g){ve(e,e.return,g)}}n&4&&e.stateNode!=null&&(l=e.memoizedProps,Rf(e,l,a!==null?a.memoizedProps:l)),n&1024&&(Nf=!0);break;case 6:if(It(t,e),At(e),n&4){if(e.stateNode===null)throw Error(M(162));n=e.memoizedProps,a=e.stateNode;try{a.nodeValue=n}catch(g){ve(e,e.return,g)}}break;case 3:if(Yu=null,l=La,La=vs(t.containerInfo),It(t,e),La=l,At(e),n&4&&a!==null&&a.memoizedState.isDehydrated)try{Qr(t.containerInfo)}catch(g){ve(e,e.return,g)}Nf&&(Nf=!1,T1(e));break;case 4:n=La,La=vs(e.stateNode.containerInfo),It(t,e),At(e),La=n;break;case 12:It(t,e),At(e);break;case 31:It(t,e),At(e),n&4&&(n=e.updateQueue,n!==null&&(e.updateQueue=null,Mu(e,n)));break;case 13:It(t,e),At(e),e.child.flags&8192&&e.memoizedState!==null!=(a!==null&&a.memoizedState!==null)&&(qs=Vt()),n&4&&(n=e.updateQueue,n!==null&&(e.updateQueue=null,Mu(e,n)));break;case 22:l=e.memoizedState!==null;var u=a!==null&&a.memoizedState!==null,c=Wa,s=Qe;if(Wa=c||l,Qe=s||u,It(t,e),Qe=s,Wa=c,At(e),n&8192)e:for(t=e.stateNode,t._visibility=l?t._visibility&-2:t._visibility|1,l&&(a===null||u||Wa||Qe||xl(e)),a=null,t=e;;){if(t.tag===5||t.tag===26){if(a===null){u=a=t;try{if(r=u.stateNode,l)o=r.style,typeof o.setProperty=="function"?o.setProperty("display","none","important"):o.display="none";else{i=u.stateNode;var f=u.memoizedProps.style,d=f!=null&&f.hasOwnProperty("display")?f.display:null;i.style.display=d==null||typeof d=="boolean"?"":(""+d).trim()}}catch(g){ve(u,u.return,g)}}}else if(t.tag===6){if(a===null){u=t;try{u.stateNode.nodeValue=l?"":u.memoizedProps}catch(g){ve(u,u.return,g)}}}else if(t.tag===18){if(a===null){u=t;try{var p=u.stateNode;l?gx(p,!0):gx(u.stateNode,!1)}catch(g){ve(u,u.return,g)}}}else if((t.tag!==22&&t.tag!==23||t.memoizedState===null||t===e)&&t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break e;for(;t.sibling===null;){if(t.return===null||t.return===e)break e;a===t&&(a=null),t=t.return}a===t&&(a=null),t.sibling.return=t.return,t=t.sibling}n&4&&(n=e.updateQueue,n!==null&&(a=n.retryQueue,a!==null&&(n.retryQueue=null,Mu(e,a))));break;case 19:It(t,e),At(e),n&4&&(n=e.updateQueue,n!==null&&(e.updateQueue=null,Mu(e,n)));break;case 30:break;case 21:break;default:It(t,e),At(e)}}function At(e){var t=e.flags;if(t&2){try{for(var a,n=e.return;n!==null;){if(b1(n)){a=n;break}n=n.return}if(a==null)throw Error(M(160));switch(a.tag){case 27:var l=a.stateNode,r=Of(e);ps(e,r,l);break;case 5:var o=a.stateNode;a.flags&32&&(Pr(o,""),a.flags&=-33);var i=Of(e);ps(e,i,o);break;case 3:case 4:var u=a.stateNode.containerInfo,c=Of(e);Sd(e,c,u);break;default:throw Error(M(161))}}catch(s){ve(e,e.return,s)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function T1(e){if(e.subtreeFlags&1024)for(e=e.child;e!==null;){var t=e;T1(t),t.tag===5&&t.flags&1024&&t.stateNode.reset(),e=e.sibling}}function Ka(e,t){if(t.subtreeFlags&8772)for(t=t.child;t!==null;)C1(e,t.alternate,t),t=t.sibling}function xl(e){for(e=e.child;e!==null;){var t=e;switch(t.tag){case 0:case 11:case 14:case 15:Qn(4,t,t.return),xl(t);break;case 1:Ta(t,t.return);var a=t.stateNode;typeof a.componentWillUnmount=="function"&&y1(t,t.return,a),xl(t);break;case 27:Ko(t.stateNode);case 26:case 5:Ta(t,t.return),xl(t);break;case 22:t.memoizedState===null&&xl(t);break;case 30:xl(t);break;default:xl(t)}e=e.sibling}}function Za(e,t,a){for(a=a&&(t.subtreeFlags&8772)!==0,t=t.child;t!==null;){var n=t.alternate,l=e,r=t,o=r.flags;switch(r.tag){case 0:case 11:case 15:Za(l,r,a),yi(4,r);break;case 1:if(Za(l,r,a),n=r,l=n.stateNode,typeof l.componentDidMount=="function")try{l.componentDidMount()}catch(c){ve(n,n.return,c)}if(n=r,l=n.updateQueue,l!==null){var i=n.stateNode;try{var u=l.shared.hiddenCallbacks;if(u!==null)for(l.shared.hiddenCallbacks=null,l=0;l<u.length;l++)wy(u[l],i)}catch(c){ve(n,n.return,c)}}a&&o&64&&x1(r),jo(r,r.return);break;case 27:v1(r);case 26:case 5:Za(l,r,a),a&&n===null&&o&4&&L1(r),jo(r,r.return);break;case 12:Za(l,r,a);break;case 31:Za(l,r,a),a&&o&4&&w1(l,r);break;case 13:Za(l,r,a),a&&o&4&&I1(l,r);break;case 22:r.memoizedState===null&&Za(l,r,a),jo(r,r.return);break;case 30:break;default:Za(l,r,a)}t=t.sibling}}function Cp(e,t){var a=null;e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(a=e.memoizedState.cachePool.pool),e=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(e=t.memoizedState.cachePool.pool),e!==a&&(e!=null&&e.refCount++,a!=null&&gi(a))}function Sp(e,t){e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&gi(e))}function ya(e,t,a,n){if(t.subtreeFlags&10256)for(t=t.child;t!==null;)D1(e,t,a,n),t=t.sibling}function D1(e,t,a,n){var l=t.flags;switch(t.tag){case 0:case 11:case 15:ya(e,t,a,n),l&2048&&yi(9,t);break;case 1:ya(e,t,a,n);break;case 3:ya(e,t,a,n),l&2048&&(e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&gi(e)));break;case 12:if(l&2048){ya(e,t,a,n),e=t.stateNode;try{var r=t.memoizedProps,o=r.id,i=r.onPostCommit;typeof i=="function"&&i(o,t.alternate===null?"mount":"update",e.passiveEffectDuration,-0)}catch(u){ve(t,t.return,u)}}else ya(e,t,a,n);break;case 31:ya(e,t,a,n);break;case 13:ya(e,t,a,n);break;case 23:break;case 22:r=t.stateNode,o=t.alternate,t.memoizedState!==null?r._visibility&2?ya(e,t,a,n):Xo(e,t):r._visibility&2?ya(e,t,a,n):(r._visibility|=2,gr(e,t,a,n,(t.subtreeFlags&10256)!==0||!1)),l&2048&&Cp(o,t);break;case 24:ya(e,t,a,n),l&2048&&Sp(t.alternate,t);break;default:ya(e,t,a,n)}}function gr(e,t,a,n,l){for(l=l&&((t.subtreeFlags&10256)!==0||!1),t=t.child;t!==null;){var r=e,o=t,i=a,u=n,c=o.flags;switch(o.tag){case 0:case 11:case 15:gr(r,o,i,u,l),yi(8,o);break;case 23:break;case 22:var s=o.stateNode;o.memoizedState!==null?s._visibility&2?gr(r,o,i,u,l):Xo(r,o):(s._visibility|=2,gr(r,o,i,u,l)),l&&c&2048&&Cp(o.alternate,o);break;case 24:gr(r,o,i,u,l),l&&c&2048&&Sp(o.alternate,o);break;default:gr(r,o,i,u,l)}t=t.sibling}}function Xo(e,t){if(t.subtreeFlags&10256)for(t=t.child;t!==null;){var a=e,n=t,l=n.flags;switch(n.tag){case 22:Xo(a,n),l&2048&&Cp(n.alternate,n);break;case 24:Xo(a,n),l&2048&&Sp(n.alternate,n);break;default:Xo(a,n)}t=t.sibling}}var No=8192;function hr(e,t,a){if(e.subtreeFlags&No)for(e=e.child;e!==null;)M1(e,t,a),e=e.sibling}function M1(e,t,a){switch(e.tag){case 26:hr(e,t,a),e.flags&No&&e.memoizedState!==null&&Ok(a,La,e.memoizedState,e.memoizedProps);break;case 5:hr(e,t,a);break;case 3:case 4:var n=La;La=vs(e.stateNode.containerInfo),hr(e,t,a),La=n;break;case 22:e.memoizedState===null&&(n=e.alternate,n!==null&&n.memoizedState!==null?(n=No,No=16777216,hr(e,t,a),No=n):hr(e,t,a));break;default:hr(e,t,a)}}function E1(e){var t=e.alternate;if(t!==null&&(e=t.child,e!==null)){t.child=null;do t=e.sibling,e.sibling=null,e=t;while(e!==null)}}function Do(e){var t=e.deletions;if((e.flags&16)!==0){if(t!==null)for(var a=0;a<t.length;a++){var n=t[a];et=n,B1(n,e)}E1(e)}if(e.subtreeFlags&10256)for(e=e.child;e!==null;)z1(e),e=e.sibling}function z1(e){switch(e.tag){case 0:case 11:case 15:Do(e),e.flags&2048&&Qn(9,e,e.return);break;case 3:Do(e);break;case 12:Do(e);break;case 22:var t=e.stateNode;e.memoizedState!==null&&t._visibility&2&&(e.return===null||e.return.tag!==13)?(t._visibility&=-3,Xu(e)):Do(e);break;default:Do(e)}}function Xu(e){var t=e.deletions;if((e.flags&16)!==0){if(t!==null)for(var a=0;a<t.length;a++){var n=t[a];et=n,B1(n,e)}E1(e)}for(e=e.child;e!==null;){switch(t=e,t.tag){case 0:case 11:case 15:Qn(8,t,t.return),Xu(t);break;case 22:a=t.stateNode,a._visibility&2&&(a._visibility&=-3,Xu(t));break;default:Xu(t)}e=e.sibling}}function B1(e,t){for(;et!==null;){var a=et;switch(a.tag){case 0:case 11:case 15:Qn(8,a,t);break;case 23:case 22:if(a.memoizedState!==null&&a.memoizedState.cachePool!==null){var n=a.memoizedState.cachePool.pool;n!=null&&n.refCount++}break;case 24:gi(a.memoizedState.cache)}if(n=a.child,n!==null)n.return=a,et=n;else e:for(a=e;et!==null;){n=et;var l=n.sibling,r=n.return;if(S1(n),n===a){et=null;break e}if(l!==null){l.return=r,et=l;break e}et=r}}}var WS={getCacheForType:function(e){var t=ct(Ye),a=t.data.get(e);return a===void 0&&(a=e(),t.data.set(e,a)),a},cacheSignal:function(){return ct(Ye).controller.signal}},$S=typeof WeakMap=="function"?WeakMap:Map,ge=0,we=null,se=null,fe=0,be=0,Ft=null,Bn=!1,Wr=!1,kp=!1,cn=0,qe=0,Yn=0,Cl=0,wp=0,Gt=0,Gr=0,Qo=null,Dt=null,kd=!1,qs=0,R1=0,ms=1/0,hs=null,Fn=null,Je=0,Hn=null,Vr=null,ln=0,wd=0,Id=null,O1=null,Yo=0,Ad=null;function Qt(){return(ge&2)!==0&&fe!==0?fe&-fe:W.T!==null?Ap():Vx()}function N1(){if(Gt===0)if((fe&536870912)===0||pe){var e=bu;bu<<=1,(bu&3932160)===0&&(bu=262144),Gt=e}else Gt=536870912;return e=Kt.current,e!==null&&(e.flags|=32),Gt}function Mt(e,t,a){(e===we&&(be===2||be===9)||e.cancelPendingCommit!==null)&&(jr(e,0),Rn(e,fe,Gt,!1)),pi(e,a),((ge&2)===0||e!==we)&&(e===we&&((ge&2)===0&&(Cl|=a),qe===4&&Rn(e,fe,Gt,!1)),Ea(e))}function q1(e,t,a){if((ge&6)!==0)throw Error(M(327));var n=!a&&(t&127)===0&&(t&e.expiredLanes)===0||di(e,t),l=n?ak(e,t):qf(e,t,!0),r=n;do{if(l===0){Wr&&!n&&Rn(e,t,0,!1);break}else{if(a=e.current.alternate,r&&!ek(a)){l=qf(e,t,!1),r=!1;continue}if(l===2){if(r=t,e.errorRecoveryDisabledLanes&r)var o=0;else o=e.pendingLanes&-536870913,o=o!==0?o:o&536870912?536870912:0;if(o!==0){t=o;e:{var i=e;l=Qo;var u=i.current.memoizedState.isDehydrated;if(u&&(jr(i,o).flags|=256),o=qf(i,o,!1),o!==2){if(kp&&!u){i.errorRecoveryDisabledLanes|=r,Cl|=r,l=4;break e}r=Dt,Dt=l,r!==null&&(Dt===null?Dt=r:Dt.push.apply(Dt,r))}l=o}if(r=!1,l!==2)continue}}if(l===1){jr(e,0),Rn(e,t,0,!0);break}e:{switch(n=e,r=l,r){case 0:case 1:throw Error(M(345));case 4:if((t&4194048)!==t)break;case 6:Rn(n,t,Gt,!Bn);break e;case 2:Dt=null;break;case 3:case 5:break;default:throw Error(M(329))}if((t&62914560)===t&&(l=qs+300-Vt(),10<l)){if(Rn(n,t,Gt,!Bn),Is(n,0,!0)!==0)break e;ln=t,n.timeoutHandle=nL(tx.bind(null,n,a,Dt,hs,kd,t,Gt,Cl,Gr,Bn,r,"Throttled",-0,0),l);break e}tx(n,a,Dt,hs,kd,t,Gt,Cl,Gr,Bn,r,null,-0,0)}}break}while(!0);Ea(e)}function tx(e,t,a,n,l,r,o,i,u,c,s,f,d,p){if(e.timeoutHandle=-1,f=t.subtreeFlags,f&8192||(f&16785408)===16785408){f={stylesheets:null,count:0,imgCount:0,imgBytes:0,suspenseyImages:[],waitingForImages:!0,waitingForViewTransition:!1,unsuspend:en},M1(t,r,f);var g=(r&62914560)===r?qs-Vt():(r&4194048)===r?R1-Vt():0;if(g=Nk(f,g),g!==null){ln=r,e.cancelPendingCommit=g(nx.bind(null,e,t,r,a,n,l,o,i,u,s,f,null,d,p)),Rn(e,r,o,!c);return}}nx(e,t,r,a,n,l,o,i,u)}function ek(e){for(var t=e;;){var a=t.tag;if((a===0||a===11||a===15)&&t.flags&16384&&(a=t.updateQueue,a!==null&&(a=a.stores,a!==null)))for(var n=0;n<a.length;n++){var l=a[n],r=l.getSnapshot;l=l.value;try{if(!Yt(r(),l))return!1}catch{return!1}}if(a=t.child,t.subtreeFlags&16384&&a!==null)a.return=t,t=a;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function Rn(e,t,a,n){t&=~wp,t&=~Cl,e.suspendedLanes|=t,e.pingedLanes&=~t,n&&(e.warmLanes|=t),n=e.expirationTimes;for(var l=t;0<l;){var r=31-Xt(l),o=1<<r;n[r]=-1,l&=~o}a!==0&&Hx(e,a,t)}function Us(){return(ge&6)===0?(Li(0,!1),!1):!0}function Ip(){if(se!==null){if(be===0)var e=se.return;else e=se,tn=zl=null,fp(e),Rr=null,ai=0,e=se;for(;e!==null;)g1(e.alternate,e),e=e.return;se=null}}function jr(e,t){var a=e.timeoutHandle;a!==-1&&(e.timeoutHandle=-1,yk(a)),a=e.cancelPendingCommit,a!==null&&(e.cancelPendingCommit=null,a()),ln=0,Ip(),we=e,se=a=an(e.current,null),fe=t,be=0,Ft=null,Bn=!1,Wr=di(e,t),kp=!1,Gr=Gt=wp=Cl=Yn=qe=0,Dt=Qo=null,kd=!1,(t&8)!==0&&(t|=t&32);var n=e.entangledLanes;if(n!==0)for(e=e.entanglements,n&=t;0<n;){var l=31-Xt(n),r=1<<l;t|=e[l],n&=~r}return cn=t,Ms(),a}function U1(e,t){le=null,W.H=li,t===Jr||t===zs?(t=Bg(),be=3):t===lp?(t=Bg(),be=4):be=t===bp?8:t!==null&&typeof t=="object"&&typeof t.then=="function"?6:1,Ft=t,se===null&&(qe=1,fs(e,la(t,e.current)))}function P1(){var e=Kt.current;return e===null?!0:(fe&4194048)===fe?oa===null:(fe&62914560)===fe||(fe&536870912)!==0?e===oa:!1}function F1(){var e=W.H;return W.H=li,e===null?li:e}function H1(){var e=W.A;return W.A=WS,e}function gs(){qe=4,Bn||(fe&4194048)!==fe&&Kt.current!==null||(Wr=!0),(Yn&134217727)===0&&(Cl&134217727)===0||we===null||Rn(we,fe,Gt,!1)}function qf(e,t,a){var n=ge;ge|=2;var l=F1(),r=H1();(we!==e||fe!==t)&&(hs=null,jr(e,t)),t=!1;var o=qe;e:do try{if(be!==0&&se!==null){var i=se,u=Ft;switch(be){case 8:Ip(),o=6;break e;case 3:case 2:case 9:case 6:Kt.current===null&&(t=!0);var c=be;if(be=0,Ft=null,Dr(e,i,u,c),a&&Wr){o=0;break e}break;default:c=be,be=0,Ft=null,Dr(e,i,u,c)}}tk(),o=qe;break}catch(s){U1(e,s)}while(!0);return t&&e.shellSuspendCounter++,tn=zl=null,ge=n,W.H=l,W.A=r,se===null&&(we=null,fe=0,Ms()),o}function tk(){for(;se!==null;)_1(se)}function ak(e,t){var a=ge;ge|=2;var n=F1(),l=H1();we!==e||fe!==t?(hs=null,ms=Vt()+500,jr(e,t)):Wr=di(e,t);e:do try{if(be!==0&&se!==null){t=se;var r=Ft;t:switch(be){case 1:be=0,Ft=null,Dr(e,t,r,1);break;case 2:case 9:if(zg(r)){be=0,Ft=null,ax(t);break}t=function(){be!==2&&be!==9||we!==e||(be=7),Ea(e)},r.then(t,t);break e;case 3:be=7;break e;case 4:be=5;break e;case 7:zg(r)?(be=0,Ft=null,ax(t)):(be=0,Ft=null,Dr(e,t,r,7));break;case 5:var o=null;switch(se.tag){case 26:o=se.memoizedState;case 5:case 27:var i=se;if(o?uL(o):i.stateNode.complete){be=0,Ft=null;var u=i.sibling;if(u!==null)se=u;else{var c=i.return;c!==null?(se=c,Ps(c)):se=null}break t}}be=0,Ft=null,Dr(e,t,r,5);break;case 6:be=0,Ft=null,Dr(e,t,r,6);break;case 8:Ip(),qe=6;break e;default:throw Error(M(462))}}nk();break}catch(s){U1(e,s)}while(!0);return tn=zl=null,W.H=n,W.A=l,ge=a,se!==null?0:(we=null,fe=0,Ms(),qe)}function nk(){for(;se!==null&&!IC();)_1(se)}function _1(e){var t=h1(e.alternate,e,cn);e.memoizedProps=e.pendingProps,t===null?Ps(e):se=t}function ax(e){var t=e,a=t.alternate;switch(t.tag){case 15:case 0:t=Kg(a,t,t.pendingProps,t.type,void 0,fe);break;case 11:t=Kg(a,t,t.pendingProps,t.type.render,t.ref,fe);break;case 5:fp(t);default:g1(a,t),t=se=gy(t,cn),t=h1(a,t,cn)}e.memoizedProps=e.pendingProps,t===null?Ps(e):se=t}function Dr(e,t,a,n){tn=zl=null,fp(t),Rr=null,ai=0;var l=t.return;try{if(jS(e,l,t,a,fe)){qe=1,fs(e,la(a,e.current)),se=null;return}}catch(r){if(l!==null)throw se=l,r;qe=1,fs(e,la(a,e.current)),se=null;return}t.flags&32768?(pe||n===1?e=!0:Wr||(fe&536870912)!==0?e=!1:(Bn=e=!0,(n===2||n===9||n===3||n===6)&&(n=Kt.current,n!==null&&n.tag===13&&(n.flags|=16384))),G1(t,e)):Ps(t)}function Ps(e){var t=e;do{if((t.flags&32768)!==0){G1(t,Bn);return}e=t.return;var a=YS(t.alternate,t,cn);if(a!==null){se=a;return}if(t=t.sibling,t!==null){se=t;return}se=t=e}while(t!==null);qe===0&&(qe=5)}function G1(e,t){do{var a=KS(e.alternate,e);if(a!==null){a.flags&=32767,se=a;return}if(a=e.return,a!==null&&(a.flags|=32768,a.subtreeFlags=0,a.deletions=null),!t&&(e=e.sibling,e!==null)){se=e;return}se=e=a}while(e!==null);qe=6,se=null}function nx(e,t,a,n,l,r,o,i,u){e.cancelPendingCommit=null;do Fs();while(Je!==0);if((ge&6)!==0)throw Error(M(327));if(t!==null){if(t===e.current)throw Error(M(177));if(r=t.lanes|t.childLanes,r|=Jd,NC(e,a,r,o,i,u),e===we&&(se=we=null,fe=0),Vr=t,Hn=e,ln=a,wd=r,Id=l,O1=n,(t.subtreeFlags&10256)!==0||(t.flags&10256)!==0?(e.callbackNode=null,e.callbackPriority=0,ik(es,function(){return Y1(),null})):(e.callbackNode=null,e.callbackPriority=0),n=(t.flags&13878)!==0,(t.subtreeFlags&13878)!==0||n){n=W.T,W.T=null,l=xe.p,xe.p=2,o=ge,ge|=4;try{ZS(e,t,a)}finally{ge=o,xe.p=l,W.T=n}}Je=1,V1(),j1(),X1()}}function V1(){if(Je===1){Je=0;var e=Hn,t=Vr,a=(t.flags&13878)!==0;if((t.subtreeFlags&13878)!==0||a){a=W.T,W.T=null;var n=xe.p;xe.p=2;var l=ge;ge|=4;try{A1(t,e);var r=Ed,o=uy(e.containerInfo),i=r.focusedElem,u=r.selectionRange;if(o!==i&&i&&i.ownerDocument&&iy(i.ownerDocument.documentElement,i)){if(u!==null&&Zd(i)){var c=u.start,s=u.end;if(s===void 0&&(s=c),"selectionStart"in i)i.selectionStart=c,i.selectionEnd=Math.min(s,i.value.length);else{var f=i.ownerDocument||document,d=f&&f.defaultView||window;if(d.getSelection){var p=d.getSelection(),g=i.textContent.length,y=Math.min(u.start,g),w=u.end===void 0?y:Math.min(u.end,g);!p.extend&&y>w&&(o=w,w=y,y=o);var x=wg(i,y),m=wg(i,w);if(x&&m&&(p.rangeCount!==1||p.anchorNode!==x.node||p.anchorOffset!==x.offset||p.focusNode!==m.node||p.focusOffset!==m.offset)){var h=f.createRange();h.setStart(x.node,x.offset),p.removeAllRanges(),y>w?(p.addRange(h),p.extend(m.node,m.offset)):(h.setEnd(m.node,m.offset),p.addRange(h))}}}}for(f=[],p=i;p=p.parentNode;)p.nodeType===1&&f.push({element:p,left:p.scrollLeft,top:p.scrollTop});for(typeof i.focus=="function"&&i.focus(),i=0;i<f.length;i++){var L=f[i];L.element.scrollLeft=L.left,L.element.scrollTop=L.top}}ks=!!Md,Ed=Md=null}finally{ge=l,xe.p=n,W.T=a}}e.current=t,Je=2}}function j1(){if(Je===2){Je=0;var e=Hn,t=Vr,a=(t.flags&8772)!==0;if((t.subtreeFlags&8772)!==0||a){a=W.T,W.T=null;var n=xe.p;xe.p=2;var l=ge;ge|=4;try{C1(e,t.alternate,t)}finally{ge=l,xe.p=n,W.T=a}}Je=3}}function X1(){if(Je===4||Je===3){Je=0,AC();var e=Hn,t=Vr,a=ln,n=O1;(t.subtreeFlags&10256)!==0||(t.flags&10256)!==0?Je=5:(Je=0,Vr=Hn=null,Q1(e,e.pendingLanes));var l=e.pendingLanes;if(l===0&&(Fn=null),Gd(a),t=t.stateNode,jt&&typeof jt.onCommitFiberRoot=="function")try{jt.onCommitFiberRoot(fi,t,void 0,(t.current.flags&128)===128)}catch{}if(n!==null){t=W.T,l=xe.p,xe.p=2,W.T=null;try{for(var r=e.onRecoverableError,o=0;o<n.length;o++){var i=n[o];r(i.value,{componentStack:i.stack})}}finally{W.T=t,xe.p=l}}(ln&3)!==0&&Fs(),Ea(e),l=e.pendingLanes,(a&261930)!==0&&(l&42)!==0?e===Ad?Yo++:(Yo=0,Ad=e):Yo=0,Li(0,!1)}}function Q1(e,t){(e.pooledCacheLanes&=t)===0&&(t=e.pooledCache,t!=null&&(e.pooledCache=null,gi(t)))}function Fs(){return V1(),j1(),X1(),Y1()}function Y1(){if(Je!==5)return!1;var e=Hn,t=wd;wd=0;var a=Gd(ln),n=W.T,l=xe.p;try{xe.p=32>a?32:a,W.T=null,a=Id,Id=null;var r=Hn,o=ln;if(Je=0,Vr=Hn=null,ln=0,(ge&6)!==0)throw Error(M(331));var i=ge;if(ge|=4,z1(r.current),D1(r,r.current,o,a),ge=i,Li(0,!1),jt&&typeof jt.onPostCommitFiberRoot=="function")try{jt.onPostCommitFiberRoot(fi,r)}catch{}return!0}finally{xe.p=l,W.T=n,Q1(e,t)}}function lx(e,t,a){t=la(a,t),t=bd(e.stateNode,t,2),e=Pn(e,t,2),e!==null&&(pi(e,2),Ea(e))}function ve(e,t,a){if(e.tag===3)lx(e,e,a);else for(;t!==null;){if(t.tag===3){lx(t,e,a);break}else if(t.tag===1){var n=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof n.componentDidCatch=="function"&&(Fn===null||!Fn.has(n))){e=la(a,e),a=s1(2),n=Pn(t,a,2),n!==null&&(c1(a,n,t,e),pi(n,2),Ea(n));break}}t=t.return}}function Uf(e,t,a){var n=e.pingCache;if(n===null){n=e.pingCache=new $S;var l=new Set;n.set(t,l)}else l=n.get(t),l===void 0&&(l=new Set,n.set(t,l));l.has(a)||(kp=!0,l.add(a),e=lk.bind(null,e,t,a),t.then(e,e))}function lk(e,t,a){var n=e.pingCache;n!==null&&n.delete(t),e.pingedLanes|=e.suspendedLanes&a,e.warmLanes&=~a,we===e&&(fe&a)===a&&(qe===4||qe===3&&(fe&62914560)===fe&&300>Vt()-qs?(ge&2)===0&&jr(e,0):wp|=a,Gr===fe&&(Gr=0)),Ea(e)}function K1(e,t){t===0&&(t=Fx()),e=El(e,t),e!==null&&(pi(e,t),Ea(e))}function rk(e){var t=e.memoizedState,a=0;t!==null&&(a=t.retryLane),K1(e,a)}function ok(e,t){var a=0;switch(e.tag){case 31:case 13:var n=e.stateNode,l=e.memoizedState;l!==null&&(a=l.retryLane);break;case 19:n=e.stateNode;break;case 22:n=e.stateNode._retryCache;break;default:throw Error(M(314))}n!==null&&n.delete(t),K1(e,a)}function ik(e,t){return Hd(e,t)}var xs=null,xr=null,Td=!1,ys=!1,Pf=!1,On=0;function Ea(e){e!==xr&&e.next===null&&(xr===null?xs=xr=e:xr=xr.next=e),ys=!0,Td||(Td=!0,sk())}function Li(e,t){if(!Pf&&ys){Pf=!0;do for(var a=!1,n=xs;n!==null;){if(!t)if(e!==0){var l=n.pendingLanes;if(l===0)var r=0;else{var o=n.suspendedLanes,i=n.pingedLanes;r=(1<<31-Xt(42|e)+1)-1,r&=l&~(o&~i),r=r&201326741?r&201326741|1:r?r|2:0}r!==0&&(a=!0,rx(n,r))}else r=fe,r=Is(n,n===we?r:0,n.cancelPendingCommit!==null||n.timeoutHandle!==-1),(r&3)===0||di(n,r)||(a=!0,rx(n,r));n=n.next}while(a);Pf=!1}}function uk(){Z1()}function Z1(){ys=Td=!1;var e=0;On!==0&&xk()&&(e=On);for(var t=Vt(),a=null,n=xs;n!==null;){var l=n.next,r=J1(n,t);r===0?(n.next=null,a===null?xs=l:a.next=l,l===null&&(xr=a)):(a=n,(e!==0||(r&3)!==0)&&(ys=!0)),n=l}Je!==0&&Je!==5||Li(e,!1),On!==0&&(On=0)}function J1(e,t){for(var a=e.suspendedLanes,n=e.pingedLanes,l=e.expirationTimes,r=e.pendingLanes&-62914561;0<r;){var o=31-Xt(r),i=1<<o,u=l[o];u===-1?((i&a)===0||(i&n)!==0)&&(l[o]=OC(i,t)):u<=t&&(e.expiredLanes|=i),r&=~i}if(t=we,a=fe,a=Is(e,e===t?a:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),n=e.callbackNode,a===0||e===t&&(be===2||be===9)||e.cancelPendingCommit!==null)return n!==null&&n!==null&&mf(n),e.callbackNode=null,e.callbackPriority=0;if((a&3)===0||di(e,a)){if(t=a&-a,t===e.callbackPriority)return t;switch(n!==null&&mf(n),Gd(a)){case 2:case 8:a=Ux;break;case 32:a=es;break;case 268435456:a=Px;break;default:a=es}return n=W1.bind(null,e),a=Hd(a,n),e.callbackPriority=t,e.callbackNode=a,t}return n!==null&&n!==null&&mf(n),e.callbackPriority=2,e.callbackNode=null,2}function W1(e,t){if(Je!==0&&Je!==5)return e.callbackNode=null,e.callbackPriority=0,null;var a=e.callbackNode;if(Fs()&&e.callbackNode!==a)return null;var n=fe;return n=Is(e,e===we?n:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),n===0?null:(q1(e,n,t),J1(e,Vt()),e.callbackNode!=null&&e.callbackNode===a?W1.bind(null,e):null)}function rx(e,t){if(Fs())return null;q1(e,t,!0)}function sk(){Lk(function(){(ge&6)!==0?Hd(qx,uk):Z1()})}function Ap(){if(On===0){var e=Fr;e===0&&(e=Lu,Lu<<=1,(Lu&261888)===0&&(Lu=256)),On=e}return On}function ox(e){return e==null||typeof e=="symbol"||typeof e=="boolean"?null:typeof e=="function"?e:qu(""+e)}function ix(e,t){var a=t.ownerDocument.createElement("input");return a.name=t.name,a.value=t.value,e.id&&a.setAttribute("form",e.id),t.parentNode.insertBefore(a,t),e=new FormData(e),a.parentNode.removeChild(a),e}function ck(e,t,a,n,l){if(t==="submit"&&a&&a.stateNode===l){var r=ox((l[Et]||null).action),o=n.submitter;o&&(t=(t=o[Et]||null)?ox(t.formAction):o.getAttribute("formAction"),t!==null&&(r=t,o=null));var i=new As("action","action",null,n,l);e.push({event:i,listeners:[{instance:null,listener:function(){if(n.defaultPrevented){if(On!==0){var u=o?ix(l,o):new FormData(l);yd(a,{pending:!0,data:u,method:l.method,action:r},null,u)}}else typeof r=="function"&&(i.preventDefault(),u=o?ix(l,o):new FormData(l),yd(a,{pending:!0,data:u,method:l.method,action:r},r,u))},currentTarget:l}]})}}for(Eu=0;Eu<od.length;Eu++)zu=od[Eu],ux=zu.toLowerCase(),sx=zu[0].toUpperCase()+zu.slice(1),ba(ux,"on"+sx);var zu,ux,sx,Eu;ba(cy,"onAnimationEnd");ba(fy,"onAnimationIteration");ba(dy,"onAnimationStart");ba("dblclick","onDoubleClick");ba("focusin","onFocus");ba("focusout","onBlur");ba(TS,"onTransitionRun");ba(DS,"onTransitionStart");ba(MS,"onTransitionCancel");ba(py,"onTransitionEnd");Ur("onMouseEnter",["mouseout","mouseover"]);Ur("onMouseLeave",["mouseout","mouseover"]);Ur("onPointerEnter",["pointerout","pointerover"]);Ur("onPointerLeave",["pointerout","pointerover"]);Tl("onChange","change click focusin focusout input keydown keyup selectionchange".split(" "));Tl("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));Tl("onBeforeInput",["compositionend","keypress","textInput","paste"]);Tl("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));Tl("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));Tl("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var ri="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),fk=new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(ri));function $1(e,t){t=(t&4)!==0;for(var a=0;a<e.length;a++){var n=e[a],l=n.event;n=n.listeners;e:{var r=void 0;if(t)for(var o=n.length-1;0<=o;o--){var i=n[o],u=i.instance,c=i.currentTarget;if(i=i.listener,u!==r&&l.isPropagationStopped())break e;r=i,l.currentTarget=c;try{r(l)}catch(s){as(s)}l.currentTarget=null,r=u}else for(o=0;o<n.length;o++){if(i=n[o],u=i.instance,c=i.currentTarget,i=i.listener,u!==r&&l.isPropagationStopped())break e;r=i,l.currentTarget=c;try{r(l)}catch(s){as(s)}l.currentTarget=null,r=u}}}}function ue(e,t){var a=t[Wf];a===void 0&&(a=t[Wf]=new Set);var n=e+"__bubble";a.has(n)||(eL(t,e,2,!1),a.add(n))}function Ff(e,t,a){var n=0;t&&(n|=4),eL(a,e,n,t)}var Bu="_reactListening"+Math.random().toString(36).slice(2);function Tp(e){if(!e[Bu]){e[Bu]=!0,jx.forEach(function(a){a!=="selectionchange"&&(fk.has(a)||Ff(a,!1,e),Ff(a,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[Bu]||(t[Bu]=!0,Ff("selectionchange",!1,t))}}function eL(e,t,a,n){switch(pL(t)){case 2:var l=Pk;break;case 8:l=Fk;break;default:l=zp}a=l.bind(null,t,a,e),l=void 0,!nd||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(l=!0),n?l!==void 0?e.addEventListener(t,a,{capture:!0,passive:l}):e.addEventListener(t,a,!0):l!==void 0?e.addEventListener(t,a,{passive:l}):e.addEventListener(t,a,!1)}function Hf(e,t,a,n,l){var r=n;if((t&1)===0&&(t&2)===0&&n!==null)e:for(;;){if(n===null)return;var o=n.tag;if(o===3||o===4){var i=n.stateNode.containerInfo;if(i===l)break;if(o===4)for(o=n.return;o!==null;){var u=o.tag;if((u===3||u===4)&&o.stateNode.containerInfo===l)return;o=o.return}for(;i!==null;){if(o=br(i),o===null)return;if(u=o.tag,u===5||u===6||u===26||u===27){n=r=o;continue e}i=i.parentNode}}n=n.return}$x(function(){var c=r,s=Xd(a),f=[];e:{var d=my.get(e);if(d!==void 0){var p=As,g=e;switch(e){case"keypress":if(Pu(a)===0)break e;case"keydown":case"keyup":p=oS;break;case"focusin":g="focus",p=Lf;break;case"focusout":g="blur",p=Lf;break;case"beforeblur":case"afterblur":p=Lf;break;case"click":if(a.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":p=gg;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":p=YC;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":p=sS;break;case cy:case fy:case dy:p=JC;break;case py:p=fS;break;case"scroll":case"scrollend":p=XC;break;case"wheel":p=pS;break;case"copy":case"cut":case"paste":p=$C;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":p=yg;break;case"toggle":case"beforetoggle":p=hS}var y=(t&4)!==0,w=!y&&(e==="scroll"||e==="scrollend"),x=y?d!==null?d+"Capture":null:d;y=[];for(var m=c,h;m!==null;){var L=m;if(h=L.stateNode,L=L.tag,L!==5&&L!==26&&L!==27||h===null||x===null||(L=Jo(m,x),L!=null&&y.push(oi(m,L,h))),w)break;m=m.return}0<y.length&&(d=new p(d,g,null,a,s),f.push({event:d,listeners:y}))}}if((t&7)===0){e:{if(d=e==="mouseover"||e==="pointerover",p=e==="mouseout"||e==="pointerout",d&&a!==ad&&(g=a.relatedTarget||a.fromElement)&&(br(g)||g[Yr]))break e;if((p||d)&&(d=s.window===s?s:(d=s.ownerDocument)?d.defaultView||d.parentWindow:window,p?(g=a.relatedTarget||a.toElement,p=c,g=g?br(g):null,g!==null&&(w=ci(g),y=g.tag,g!==w||y!==5&&y!==27&&y!==6)&&(g=null)):(p=null,g=c),p!==g)){if(y=gg,L="onMouseLeave",x="onMouseEnter",m="mouse",(e==="pointerout"||e==="pointerover")&&(y=yg,L="onPointerLeave",x="onPointerEnter",m="pointer"),w=p==null?d:Ro(p),h=g==null?d:Ro(g),d=new y(L,m+"leave",p,a,s),d.target=w,d.relatedTarget=h,L=null,br(s)===c&&(y=new y(x,m+"enter",g,a,s),y.target=h,y.relatedTarget=w,L=y),w=L,p&&g)t:{for(y=dk,x=p,m=g,h=0,L=x;L;L=y(L))h++;L=0;for(var I=m;I;I=y(I))L++;for(;0<h-L;)x=y(x),h--;for(;0<L-h;)m=y(m),L--;for(;h--;){if(x===m||m!==null&&x===m.alternate){y=x;break t}x=y(x),m=y(m)}y=null}else y=null;p!==null&&cx(f,d,p,y,!1),g!==null&&w!==null&&cx(f,w,g,y,!0)}}e:{if(d=c?Ro(c):window,p=d.nodeName&&d.nodeName.toLowerCase(),p==="select"||p==="input"&&d.type==="file")var C=Cg;else if(vg(d))if(ry)C=wS;else{C=SS;var T=CS}else p=d.nodeName,!p||p.toLowerCase()!=="input"||d.type!=="checkbox"&&d.type!=="radio"?c&&jd(c.elementType)&&(C=Cg):C=kS;if(C&&(C=C(e,c))){ly(f,C,a,s);break e}T&&T(e,d,c),e==="focusout"&&c&&d.type==="number"&&c.memoizedProps.value!=null&&td(d,"number",d.value)}switch(T=c?Ro(c):window,e){case"focusin":(vg(T)||T.contentEditable==="true")&&(Sr=T,ld=c,Po=null);break;case"focusout":Po=ld=Sr=null;break;case"mousedown":rd=!0;break;case"contextmenu":case"mouseup":case"dragend":rd=!1,Ig(f,a,s);break;case"selectionchange":if(AS)break;case"keydown":case"keyup":Ig(f,a,s)}var N;if(Kd)e:{switch(e){case"compositionstart":var P="onCompositionStart";break e;case"compositionend":P="onCompositionEnd";break e;case"compositionupdate":P="onCompositionUpdate";break e}P=void 0}else Cr?ay(e,a)&&(P="onCompositionEnd"):e==="keydown"&&a.keyCode===229&&(P="onCompositionStart");P&&(ty&&a.locale!=="ko"&&(Cr||P!=="onCompositionStart"?P==="onCompositionEnd"&&Cr&&(N=ey()):(zn=s,Qd="value"in zn?zn.value:zn.textContent,Cr=!0)),T=Ls(c,P),0<T.length&&(P=new xg(P,e,null,a,s),f.push({event:P,listeners:T}),N?P.data=N:(N=ny(a),N!==null&&(P.data=N)))),(N=xS?yS(e,a):LS(e,a))&&(P=Ls(c,"onBeforeInput"),0<P.length&&(T=new xg("onBeforeInput","beforeinput",null,a,s),f.push({event:T,listeners:P}),T.data=N)),ck(f,e,c,a,s)}$1(f,t)})}function oi(e,t,a){return{instance:e,listener:t,currentTarget:a}}function Ls(e,t){for(var a=t+"Capture",n=[];e!==null;){var l=e,r=l.stateNode;if(l=l.tag,l!==5&&l!==26&&l!==27||r===null||(l=Jo(e,a),l!=null&&n.unshift(oi(e,l,r)),l=Jo(e,t),l!=null&&n.push(oi(e,l,r))),e.tag===3)return n;e=e.return}return[]}function dk(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5&&e.tag!==27);return e||null}function cx(e,t,a,n,l){for(var r=t._reactName,o=[];a!==null&&a!==n;){var i=a,u=i.alternate,c=i.stateNode;if(i=i.tag,u!==null&&u===n)break;i!==5&&i!==26&&i!==27||c===null||(u=c,l?(c=Jo(a,r),c!=null&&o.unshift(oi(a,c,u))):l||(c=Jo(a,r),c!=null&&o.push(oi(a,c,u)))),a=a.return}o.length!==0&&e.push({event:t,listeners:o})}var pk=/\r\n?/g,mk=/\u0000|\uFFFD/g;function fx(e){return(typeof e=="string"?e:""+e).replace(pk,`
`).replace(mk,"")}function tL(e,t){return t=fx(t),fx(e)===t}function Ce(e,t,a,n,l,r){switch(a){case"children":typeof n=="string"?t==="body"||t==="textarea"&&n===""||Pr(e,n):(typeof n=="number"||typeof n=="bigint")&&t!=="body"&&Pr(e,""+n);break;case"className":Cu(e,"class",n);break;case"tabIndex":Cu(e,"tabindex",n);break;case"dir":case"role":case"viewBox":case"width":case"height":Cu(e,a,n);break;case"style":Wx(e,n,r);break;case"data":if(t!=="object"){Cu(e,"data",n);break}case"src":case"href":if(n===""&&(t!=="a"||a!=="href")){e.removeAttribute(a);break}if(n==null||typeof n=="function"||typeof n=="symbol"||typeof n=="boolean"){e.removeAttribute(a);break}n=qu(""+n),e.setAttribute(a,n);break;case"action":case"formAction":if(typeof n=="function"){e.setAttribute(a,"javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");break}else typeof r=="function"&&(a==="formAction"?(t!=="input"&&Ce(e,t,"name",l.name,l,null),Ce(e,t,"formEncType",l.formEncType,l,null),Ce(e,t,"formMethod",l.formMethod,l,null),Ce(e,t,"formTarget",l.formTarget,l,null)):(Ce(e,t,"encType",l.encType,l,null),Ce(e,t,"method",l.method,l,null),Ce(e,t,"target",l.target,l,null)));if(n==null||typeof n=="symbol"||typeof n=="boolean"){e.removeAttribute(a);break}n=qu(""+n),e.setAttribute(a,n);break;case"onClick":n!=null&&(e.onclick=en);break;case"onScroll":n!=null&&ue("scroll",e);break;case"onScrollEnd":n!=null&&ue("scrollend",e);break;case"dangerouslySetInnerHTML":if(n!=null){if(typeof n!="object"||!("__html"in n))throw Error(M(61));if(a=n.__html,a!=null){if(l.children!=null)throw Error(M(60));e.innerHTML=a}}break;case"multiple":e.multiple=n&&typeof n!="function"&&typeof n!="symbol";break;case"muted":e.muted=n&&typeof n!="function"&&typeof n!="symbol";break;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"defaultValue":case"defaultChecked":case"innerHTML":case"ref":break;case"autoFocus":break;case"xlinkHref":if(n==null||typeof n=="function"||typeof n=="boolean"||typeof n=="symbol"){e.removeAttribute("xlink:href");break}a=qu(""+n),e.setAttributeNS("http://www.w3.org/1999/xlink","xlink:href",a);break;case"contentEditable":case"spellCheck":case"draggable":case"value":case"autoReverse":case"externalResourcesRequired":case"focusable":case"preserveAlpha":n!=null&&typeof n!="function"&&typeof n!="symbol"?e.setAttribute(a,""+n):e.removeAttribute(a);break;case"inert":case"allowFullScreen":case"async":case"autoPlay":case"controls":case"default":case"defer":case"disabled":case"disablePictureInPicture":case"disableRemotePlayback":case"formNoValidate":case"hidden":case"loop":case"noModule":case"noValidate":case"open":case"playsInline":case"readOnly":case"required":case"reversed":case"scoped":case"seamless":case"itemScope":n&&typeof n!="function"&&typeof n!="symbol"?e.setAttribute(a,""):e.removeAttribute(a);break;case"capture":case"download":n===!0?e.setAttribute(a,""):n!==!1&&n!=null&&typeof n!="function"&&typeof n!="symbol"?e.setAttribute(a,n):e.removeAttribute(a);break;case"cols":case"rows":case"size":case"span":n!=null&&typeof n!="function"&&typeof n!="symbol"&&!isNaN(n)&&1<=n?e.setAttribute(a,n):e.removeAttribute(a);break;case"rowSpan":case"start":n==null||typeof n=="function"||typeof n=="symbol"||isNaN(n)?e.removeAttribute(a):e.setAttribute(a,n);break;case"popover":ue("beforetoggle",e),ue("toggle",e),Nu(e,"popover",n);break;case"xlinkActuate":Xa(e,"http://www.w3.org/1999/xlink","xlink:actuate",n);break;case"xlinkArcrole":Xa(e,"http://www.w3.org/1999/xlink","xlink:arcrole",n);break;case"xlinkRole":Xa(e,"http://www.w3.org/1999/xlink","xlink:role",n);break;case"xlinkShow":Xa(e,"http://www.w3.org/1999/xlink","xlink:show",n);break;case"xlinkTitle":Xa(e,"http://www.w3.org/1999/xlink","xlink:title",n);break;case"xlinkType":Xa(e,"http://www.w3.org/1999/xlink","xlink:type",n);break;case"xmlBase":Xa(e,"http://www.w3.org/XML/1998/namespace","xml:base",n);break;case"xmlLang":Xa(e,"http://www.w3.org/XML/1998/namespace","xml:lang",n);break;case"xmlSpace":Xa(e,"http://www.w3.org/XML/1998/namespace","xml:space",n);break;case"is":Nu(e,"is",n);break;case"innerText":case"textContent":break;default:(!(2<a.length)||a[0]!=="o"&&a[0]!=="O"||a[1]!=="n"&&a[1]!=="N")&&(a=VC.get(a)||a,Nu(e,a,n))}}function Dd(e,t,a,n,l,r){switch(a){case"style":Wx(e,n,r);break;case"dangerouslySetInnerHTML":if(n!=null){if(typeof n!="object"||!("__html"in n))throw Error(M(61));if(a=n.__html,a!=null){if(l.children!=null)throw Error(M(60));e.innerHTML=a}}break;case"children":typeof n=="string"?Pr(e,n):(typeof n=="number"||typeof n=="bigint")&&Pr(e,""+n);break;case"onScroll":n!=null&&ue("scroll",e);break;case"onScrollEnd":n!=null&&ue("scrollend",e);break;case"onClick":n!=null&&(e.onclick=en);break;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"innerHTML":case"ref":break;case"innerText":case"textContent":break;default:if(!Xx.hasOwnProperty(a))e:{if(a[0]==="o"&&a[1]==="n"&&(l=a.endsWith("Capture"),t=a.slice(2,l?a.length-7:void 0),r=e[Et]||null,r=r!=null?r[a]:null,typeof r=="function"&&e.removeEventListener(t,r,l),typeof n=="function")){typeof r!="function"&&r!==null&&(a in e?e[a]=null:e.hasAttribute(a)&&e.removeAttribute(a)),e.addEventListener(t,n,l);break e}a in e?e[a]=n:n===!0?e.setAttribute(a,""):Nu(e,a,n)}}}function ft(e,t,a){switch(t){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"img":ue("error",e),ue("load",e);var n=!1,l=!1,r;for(r in a)if(a.hasOwnProperty(r)){var o=a[r];if(o!=null)switch(r){case"src":n=!0;break;case"srcSet":l=!0;break;case"children":case"dangerouslySetInnerHTML":throw Error(M(137,t));default:Ce(e,t,r,o,a,null)}}l&&Ce(e,t,"srcSet",a.srcSet,a,null),n&&Ce(e,t,"src",a.src,a,null);return;case"input":ue("invalid",e);var i=r=o=l=null,u=null,c=null;for(n in a)if(a.hasOwnProperty(n)){var s=a[n];if(s!=null)switch(n){case"name":l=s;break;case"type":o=s;break;case"checked":u=s;break;case"defaultChecked":c=s;break;case"value":r=s;break;case"defaultValue":i=s;break;case"children":case"dangerouslySetInnerHTML":if(s!=null)throw Error(M(137,t));break;default:Ce(e,t,n,s,a,null)}}Kx(e,r,i,u,c,o,l,!1);return;case"select":ue("invalid",e),n=o=r=null;for(l in a)if(a.hasOwnProperty(l)&&(i=a[l],i!=null))switch(l){case"value":r=i;break;case"defaultValue":o=i;break;case"multiple":n=i;default:Ce(e,t,l,i,a,null)}t=r,a=o,e.multiple=!!n,t!=null?Er(e,!!n,t,!1):a!=null&&Er(e,!!n,a,!0);return;case"textarea":ue("invalid",e),r=l=n=null;for(o in a)if(a.hasOwnProperty(o)&&(i=a[o],i!=null))switch(o){case"value":n=i;break;case"defaultValue":l=i;break;case"children":r=i;break;case"dangerouslySetInnerHTML":if(i!=null)throw Error(M(91));break;default:Ce(e,t,o,i,a,null)}Jx(e,n,l,r);return;case"option":for(u in a)if(a.hasOwnProperty(u)&&(n=a[u],n!=null))switch(u){case"selected":e.selected=n&&typeof n!="function"&&typeof n!="symbol";break;default:Ce(e,t,u,n,a,null)}return;case"dialog":ue("beforetoggle",e),ue("toggle",e),ue("cancel",e),ue("close",e);break;case"iframe":case"object":ue("load",e);break;case"video":case"audio":for(n=0;n<ri.length;n++)ue(ri[n],e);break;case"image":ue("error",e),ue("load",e);break;case"details":ue("toggle",e);break;case"embed":case"source":case"link":ue("error",e),ue("load",e);case"area":case"base":case"br":case"col":case"hr":case"keygen":case"meta":case"param":case"track":case"wbr":case"menuitem":for(c in a)if(a.hasOwnProperty(c)&&(n=a[c],n!=null))switch(c){case"children":case"dangerouslySetInnerHTML":throw Error(M(137,t));default:Ce(e,t,c,n,a,null)}return;default:if(jd(t)){for(s in a)a.hasOwnProperty(s)&&(n=a[s],n!==void 0&&Dd(e,t,s,n,a,void 0));return}}for(i in a)a.hasOwnProperty(i)&&(n=a[i],n!=null&&Ce(e,t,i,n,a,null))}function hk(e,t,a,n){switch(t){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"input":var l=null,r=null,o=null,i=null,u=null,c=null,s=null;for(p in a){var f=a[p];if(a.hasOwnProperty(p)&&f!=null)switch(p){case"checked":break;case"value":break;case"defaultValue":u=f;default:n.hasOwnProperty(p)||Ce(e,t,p,null,n,f)}}for(var d in n){var p=n[d];if(f=a[d],n.hasOwnProperty(d)&&(p!=null||f!=null))switch(d){case"type":r=p;break;case"name":l=p;break;case"checked":c=p;break;case"defaultChecked":s=p;break;case"value":o=p;break;case"defaultValue":i=p;break;case"children":case"dangerouslySetInnerHTML":if(p!=null)throw Error(M(137,t));break;default:p!==f&&Ce(e,t,d,p,n,f)}}ed(e,o,i,u,c,s,r,l);return;case"select":p=o=i=d=null;for(r in a)if(u=a[r],a.hasOwnProperty(r)&&u!=null)switch(r){case"value":break;case"multiple":p=u;default:n.hasOwnProperty(r)||Ce(e,t,r,null,n,u)}for(l in n)if(r=n[l],u=a[l],n.hasOwnProperty(l)&&(r!=null||u!=null))switch(l){case"value":d=r;break;case"defaultValue":i=r;break;case"multiple":o=r;default:r!==u&&Ce(e,t,l,r,n,u)}t=i,a=o,n=p,d!=null?Er(e,!!a,d,!1):!!n!=!!a&&(t!=null?Er(e,!!a,t,!0):Er(e,!!a,a?[]:"",!1));return;case"textarea":p=d=null;for(i in a)if(l=a[i],a.hasOwnProperty(i)&&l!=null&&!n.hasOwnProperty(i))switch(i){case"value":break;case"children":break;default:Ce(e,t,i,null,n,l)}for(o in n)if(l=n[o],r=a[o],n.hasOwnProperty(o)&&(l!=null||r!=null))switch(o){case"value":d=l;break;case"defaultValue":p=l;break;case"children":break;case"dangerouslySetInnerHTML":if(l!=null)throw Error(M(91));break;default:l!==r&&Ce(e,t,o,l,n,r)}Zx(e,d,p);return;case"option":for(var g in a)if(d=a[g],a.hasOwnProperty(g)&&d!=null&&!n.hasOwnProperty(g))switch(g){case"selected":e.selected=!1;break;default:Ce(e,t,g,null,n,d)}for(u in n)if(d=n[u],p=a[u],n.hasOwnProperty(u)&&d!==p&&(d!=null||p!=null))switch(u){case"selected":e.selected=d&&typeof d!="function"&&typeof d!="symbol";break;default:Ce(e,t,u,d,n,p)}return;case"img":case"link":case"area":case"base":case"br":case"col":case"embed":case"hr":case"keygen":case"meta":case"param":case"source":case"track":case"wbr":case"menuitem":for(var y in a)d=a[y],a.hasOwnProperty(y)&&d!=null&&!n.hasOwnProperty(y)&&Ce(e,t,y,null,n,d);for(c in n)if(d=n[c],p=a[c],n.hasOwnProperty(c)&&d!==p&&(d!=null||p!=null))switch(c){case"children":case"dangerouslySetInnerHTML":if(d!=null)throw Error(M(137,t));break;default:Ce(e,t,c,d,n,p)}return;default:if(jd(t)){for(var w in a)d=a[w],a.hasOwnProperty(w)&&d!==void 0&&!n.hasOwnProperty(w)&&Dd(e,t,w,void 0,n,d);for(s in n)d=n[s],p=a[s],!n.hasOwnProperty(s)||d===p||d===void 0&&p===void 0||Dd(e,t,s,d,n,p);return}}for(var x in a)d=a[x],a.hasOwnProperty(x)&&d!=null&&!n.hasOwnProperty(x)&&Ce(e,t,x,null,n,d);for(f in n)d=n[f],p=a[f],!n.hasOwnProperty(f)||d===p||d==null&&p==null||Ce(e,t,f,d,n,p)}function dx(e){switch(e){case"css":case"script":case"font":case"img":case"image":case"input":case"link":return!0;default:return!1}}function gk(){if(typeof performance.getEntriesByType=="function"){for(var e=0,t=0,a=performance.getEntriesByType("resource"),n=0;n<a.length;n++){var l=a[n],r=l.transferSize,o=l.initiatorType,i=l.duration;if(r&&i&&dx(o)){for(o=0,i=l.responseEnd,n+=1;n<a.length;n++){var u=a[n],c=u.startTime;if(c>i)break;var s=u.transferSize,f=u.initiatorType;s&&dx(f)&&(u=u.responseEnd,o+=s*(u<i?1:(i-c)/(u-c)))}if(--n,t+=8*(r+o)/(l.duration/1e3),e++,10<e)break}}if(0<e)return t/e/1e6}return navigator.connection&&(e=navigator.connection.downlink,typeof e=="number")?e:5}var Md=null,Ed=null;function bs(e){return e.nodeType===9?e:e.ownerDocument}function px(e){switch(e){case"http://www.w3.org/2000/svg":return 1;case"http://www.w3.org/1998/Math/MathML":return 2;default:return 0}}function aL(e,t){if(e===0)switch(t){case"svg":return 1;case"math":return 2;default:return 0}return e===1&&t==="foreignObject"?0:e}function zd(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.children=="bigint"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var _f=null;function xk(){var e=window.event;return e&&e.type==="popstate"?e===_f?!1:(_f=e,!0):(_f=null,!1)}var nL=typeof setTimeout=="function"?setTimeout:void 0,yk=typeof clearTimeout=="function"?clearTimeout:void 0,mx=typeof Promise=="function"?Promise:void 0,Lk=typeof queueMicrotask=="function"?queueMicrotask:typeof mx<"u"?function(e){return mx.resolve(null).then(e).catch(bk)}:nL;function bk(e){setTimeout(function(){throw e})}function Zn(e){return e==="head"}function hx(e,t){var a=t,n=0;do{var l=a.nextSibling;if(e.removeChild(a),l&&l.nodeType===8)if(a=l.data,a==="/$"||a==="/&"){if(n===0){e.removeChild(l),Qr(t);return}n--}else if(a==="$"||a==="$?"||a==="$~"||a==="$!"||a==="&")n++;else if(a==="html")Ko(e.ownerDocument.documentElement);else if(a==="head"){a=e.ownerDocument.head,Ko(a);for(var r=a.firstChild;r;){var o=r.nextSibling,i=r.nodeName;r[mi]||i==="SCRIPT"||i==="STYLE"||i==="LINK"&&r.rel.toLowerCase()==="stylesheet"||a.removeChild(r),r=o}}else a==="body"&&Ko(e.ownerDocument.body);a=l}while(a);Qr(t)}function gx(e,t){var a=e;e=0;do{var n=a.nextSibling;if(a.nodeType===1?t?(a._stashedDisplay=a.style.display,a.style.display="none"):(a.style.display=a._stashedDisplay||"",a.getAttribute("style")===""&&a.removeAttribute("style")):a.nodeType===3&&(t?(a._stashedText=a.nodeValue,a.nodeValue=""):a.nodeValue=a._stashedText||""),n&&n.nodeType===8)if(a=n.data,a==="/$"){if(e===0)break;e--}else a!=="$"&&a!=="$?"&&a!=="$~"&&a!=="$!"||e++;a=n}while(a)}function Bd(e){var t=e.firstChild;for(t&&t.nodeType===10&&(t=t.nextSibling);t;){var a=t;switch(t=t.nextSibling,a.nodeName){case"HTML":case"HEAD":case"BODY":Bd(a),Vd(a);continue;case"SCRIPT":case"STYLE":continue;case"LINK":if(a.rel.toLowerCase()==="stylesheet")continue}e.removeChild(a)}}function vk(e,t,a,n){for(;e.nodeType===1;){var l=a;if(e.nodeName.toLowerCase()!==t.toLowerCase()){if(!n&&(e.nodeName!=="INPUT"||e.type!=="hidden"))break}else if(n){if(!e[mi])switch(t){case"meta":if(!e.hasAttribute("itemprop"))break;return e;case"link":if(r=e.getAttribute("rel"),r==="stylesheet"&&e.hasAttribute("data-precedence"))break;if(r!==l.rel||e.getAttribute("href")!==(l.href==null||l.href===""?null:l.href)||e.getAttribute("crossorigin")!==(l.crossOrigin==null?null:l.crossOrigin)||e.getAttribute("title")!==(l.title==null?null:l.title))break;return e;case"style":if(e.hasAttribute("data-precedence"))break;return e;case"script":if(r=e.getAttribute("src"),(r!==(l.src==null?null:l.src)||e.getAttribute("type")!==(l.type==null?null:l.type)||e.getAttribute("crossorigin")!==(l.crossOrigin==null?null:l.crossOrigin))&&r&&e.hasAttribute("async")&&!e.hasAttribute("itemprop"))break;return e;default:return e}}else if(t==="input"&&e.type==="hidden"){var r=l.name==null?null:""+l.name;if(l.type==="hidden"&&e.getAttribute("name")===r)return e}else return e;if(e=ia(e.nextSibling),e===null)break}return null}function Ck(e,t,a){if(t==="")return null;for(;e.nodeType!==3;)if((e.nodeType!==1||e.nodeName!=="INPUT"||e.type!=="hidden")&&!a||(e=ia(e.nextSibling),e===null))return null;return e}function lL(e,t){for(;e.nodeType!==8;)if((e.nodeType!==1||e.nodeName!=="INPUT"||e.type!=="hidden")&&!t||(e=ia(e.nextSibling),e===null))return null;return e}function Rd(e){return e.data==="$?"||e.data==="$~"}function Od(e){return e.data==="$!"||e.data==="$?"&&e.ownerDocument.readyState!=="loading"}function Sk(e,t){var a=e.ownerDocument;if(e.data==="$~")e._reactRetry=t;else if(e.data!=="$?"||a.readyState!=="loading")t();else{var n=function(){t(),a.removeEventListener("DOMContentLoaded",n)};a.addEventListener("DOMContentLoaded",n),e._reactRetry=n}}function ia(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?"||t==="$~"||t==="&"||t==="F!"||t==="F")break;if(t==="/$"||t==="/&")return null}}return e}var Nd=null;function xx(e){e=e.nextSibling;for(var t=0;e;){if(e.nodeType===8){var a=e.data;if(a==="/$"||a==="/&"){if(t===0)return ia(e.nextSibling);t--}else a!=="$"&&a!=="$!"&&a!=="$?"&&a!=="$~"&&a!=="&"||t++}e=e.nextSibling}return null}function yx(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var a=e.data;if(a==="$"||a==="$!"||a==="$?"||a==="$~"||a==="&"){if(t===0)return e;t--}else a!=="/$"&&a!=="/&"||t++}e=e.previousSibling}return null}function rL(e,t,a){switch(t=bs(a),e){case"html":if(e=t.documentElement,!e)throw Error(M(452));return e;case"head":if(e=t.head,!e)throw Error(M(453));return e;case"body":if(e=t.body,!e)throw Error(M(454));return e;default:throw Error(M(451))}}function Ko(e){for(var t=e.attributes;t.length;)e.removeAttributeNode(t[0]);Vd(e)}var ua=new Map,Lx=new Set;function vs(e){return typeof e.getRootNode=="function"?e.getRootNode():e.nodeType===9?e:e.ownerDocument}var fn=xe.d;xe.d={f:kk,r:wk,D:Ik,C:Ak,L:Tk,m:Dk,X:Ek,S:Mk,M:zk};function kk(){var e=fn.f(),t=Us();return e||t}function wk(e){var t=Kr(e);t!==null&&t.tag===5&&t.type==="form"?Wy(t):fn.r(e)}var $r=typeof document>"u"?null:document;function oL(e,t,a){var n=$r;if(n&&typeof t=="string"&&t){var l=na(t);l='link[rel="'+e+'"][href="'+l+'"]',typeof a=="string"&&(l+='[crossorigin="'+a+'"]'),Lx.has(l)||(Lx.add(l),e={rel:e,crossOrigin:a,href:t},n.querySelector(l)===null&&(t=n.createElement("link"),ft(t,"link",e),tt(t),n.head.appendChild(t)))}}function Ik(e){fn.D(e),oL("dns-prefetch",e,null)}function Ak(e,t){fn.C(e,t),oL("preconnect",e,t)}function Tk(e,t,a){fn.L(e,t,a);var n=$r;if(n&&e&&t){var l='link[rel="preload"][as="'+na(t)+'"]';t==="image"&&a&&a.imageSrcSet?(l+='[imagesrcset="'+na(a.imageSrcSet)+'"]',typeof a.imageSizes=="string"&&(l+='[imagesizes="'+na(a.imageSizes)+'"]')):l+='[href="'+na(e)+'"]';var r=l;switch(t){case"style":r=Xr(e);break;case"script":r=eo(e)}ua.has(r)||(e=Me({rel:"preload",href:t==="image"&&a&&a.imageSrcSet?void 0:e,as:t},a),ua.set(r,e),n.querySelector(l)!==null||t==="style"&&n.querySelector(bi(r))||t==="script"&&n.querySelector(vi(r))||(t=n.createElement("link"),ft(t,"link",e),tt(t),n.head.appendChild(t)))}}function Dk(e,t){fn.m(e,t);var a=$r;if(a&&e){var n=t&&typeof t.as=="string"?t.as:"script",l='link[rel="modulepreload"][as="'+na(n)+'"][href="'+na(e)+'"]',r=l;switch(n){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":r=eo(e)}if(!ua.has(r)&&(e=Me({rel:"modulepreload",href:e},t),ua.set(r,e),a.querySelector(l)===null)){switch(n){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":if(a.querySelector(vi(r)))return}n=a.createElement("link"),ft(n,"link",e),tt(n),a.head.appendChild(n)}}}function Mk(e,t,a){fn.S(e,t,a);var n=$r;if(n&&e){var l=Mr(n).hoistableStyles,r=Xr(e);t=t||"default";var o=l.get(r);if(!o){var i={loading:0,preload:null};if(o=n.querySelector(bi(r)))i.loading=5;else{e=Me({rel:"stylesheet",href:e,"data-precedence":t},a),(a=ua.get(r))&&Dp(e,a);var u=o=n.createElement("link");tt(u),ft(u,"link",e),u._p=new Promise(function(c,s){u.onload=c,u.onerror=s}),u.addEventListener("load",function(){i.loading|=1}),u.addEventListener("error",function(){i.loading|=2}),i.loading|=4,Qu(o,t,n)}o={type:"stylesheet",instance:o,count:1,state:i},l.set(r,o)}}}function Ek(e,t){fn.X(e,t);var a=$r;if(a&&e){var n=Mr(a).hoistableScripts,l=eo(e),r=n.get(l);r||(r=a.querySelector(vi(l)),r||(e=Me({src:e,async:!0},t),(t=ua.get(l))&&Mp(e,t),r=a.createElement("script"),tt(r),ft(r,"link",e),a.head.appendChild(r)),r={type:"script",instance:r,count:1,state:null},n.set(l,r))}}function zk(e,t){fn.M(e,t);var a=$r;if(a&&e){var n=Mr(a).hoistableScripts,l=eo(e),r=n.get(l);r||(r=a.querySelector(vi(l)),r||(e=Me({src:e,async:!0,type:"module"},t),(t=ua.get(l))&&Mp(e,t),r=a.createElement("script"),tt(r),ft(r,"link",e),a.head.appendChild(r)),r={type:"script",instance:r,count:1,state:null},n.set(l,r))}}function bx(e,t,a,n){var l=(l=Nn.current)?vs(l):null;if(!l)throw Error(M(446));switch(e){case"meta":case"title":return null;case"style":return typeof a.precedence=="string"&&typeof a.href=="string"?(t=Xr(a.href),a=Mr(l).hoistableStyles,n=a.get(t),n||(n={type:"style",instance:null,count:0,state:null},a.set(t,n)),n):{type:"void",instance:null,count:0,state:null};case"link":if(a.rel==="stylesheet"&&typeof a.href=="string"&&typeof a.precedence=="string"){e=Xr(a.href);var r=Mr(l).hoistableStyles,o=r.get(e);if(o||(l=l.ownerDocument||l,o={type:"stylesheet",instance:null,count:0,state:{loading:0,preload:null}},r.set(e,o),(r=l.querySelector(bi(e)))&&!r._p&&(o.instance=r,o.state.loading=5),ua.has(e)||(a={rel:"preload",as:"style",href:a.href,crossOrigin:a.crossOrigin,integrity:a.integrity,media:a.media,hrefLang:a.hrefLang,referrerPolicy:a.referrerPolicy},ua.set(e,a),r||Bk(l,e,a,o.state))),t&&n===null)throw Error(M(528,""));return o}if(t&&n!==null)throw Error(M(529,""));return null;case"script":return t=a.async,a=a.src,typeof a=="string"&&t&&typeof t!="function"&&typeof t!="symbol"?(t=eo(a),a=Mr(l).hoistableScripts,n=a.get(t),n||(n={type:"script",instance:null,count:0,state:null},a.set(t,n)),n):{type:"void",instance:null,count:0,state:null};default:throw Error(M(444,e))}}function Xr(e){return'href="'+na(e)+'"'}function bi(e){return'link[rel="stylesheet"]['+e+"]"}function iL(e){return Me({},e,{"data-precedence":e.precedence,precedence:null})}function Bk(e,t,a,n){e.querySelector('link[rel="preload"][as="style"]['+t+"]")?n.loading=1:(t=e.createElement("link"),n.preload=t,t.addEventListener("load",function(){return n.loading|=1}),t.addEventListener("error",function(){return n.loading|=2}),ft(t,"link",a),tt(t),e.head.appendChild(t))}function eo(e){return'[src="'+na(e)+'"]'}function vi(e){return"script[async]"+e}function vx(e,t,a){if(t.count++,t.instance===null)switch(t.type){case"style":var n=e.querySelector('style[data-href~="'+na(a.href)+'"]');if(n)return t.instance=n,tt(n),n;var l=Me({},a,{"data-href":a.href,"data-precedence":a.precedence,href:null,precedence:null});return n=(e.ownerDocument||e).createElement("style"),tt(n),ft(n,"style",l),Qu(n,a.precedence,e),t.instance=n;case"stylesheet":l=Xr(a.href);var r=e.querySelector(bi(l));if(r)return t.state.loading|=4,t.instance=r,tt(r),r;n=iL(a),(l=ua.get(l))&&Dp(n,l),r=(e.ownerDocument||e).createElement("link"),tt(r);var o=r;return o._p=new Promise(function(i,u){o.onload=i,o.onerror=u}),ft(r,"link",n),t.state.loading|=4,Qu(r,a.precedence,e),t.instance=r;case"script":return r=eo(a.src),(l=e.querySelector(vi(r)))?(t.instance=l,tt(l),l):(n=a,(l=ua.get(r))&&(n=Me({},a),Mp(n,l)),e=e.ownerDocument||e,l=e.createElement("script"),tt(l),ft(l,"link",n),e.head.appendChild(l),t.instance=l);case"void":return null;default:throw Error(M(443,t.type))}else t.type==="stylesheet"&&(t.state.loading&4)===0&&(n=t.instance,t.state.loading|=4,Qu(n,a.precedence,e));return t.instance}function Qu(e,t,a){for(var n=a.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'),l=n.length?n[n.length-1]:null,r=l,o=0;o<n.length;o++){var i=n[o];if(i.dataset.precedence===t)r=i;else if(r!==l)break}r?r.parentNode.insertBefore(e,r.nextSibling):(t=a.nodeType===9?a.head:a,t.insertBefore(e,t.firstChild))}function Dp(e,t){e.crossOrigin==null&&(e.crossOrigin=t.crossOrigin),e.referrerPolicy==null&&(e.referrerPolicy=t.referrerPolicy),e.title==null&&(e.title=t.title)}function Mp(e,t){e.crossOrigin==null&&(e.crossOrigin=t.crossOrigin),e.referrerPolicy==null&&(e.referrerPolicy=t.referrerPolicy),e.integrity==null&&(e.integrity=t.integrity)}var Yu=null;function Cx(e,t,a){if(Yu===null){var n=new Map,l=Yu=new Map;l.set(a,n)}else l=Yu,n=l.get(a),n||(n=new Map,l.set(a,n));if(n.has(e))return n;for(n.set(e,null),a=a.getElementsByTagName(e),l=0;l<a.length;l++){var r=a[l];if(!(r[mi]||r[ut]||e==="link"&&r.getAttribute("rel")==="stylesheet")&&r.namespaceURI!=="http://www.w3.org/2000/svg"){var o=r.getAttribute(t)||"";o=e+o;var i=n.get(o);i?i.push(r):n.set(o,[r])}}return n}function Sx(e,t,a){e=e.ownerDocument||e,e.head.insertBefore(a,t==="title"?e.querySelector("head > title"):null)}function Rk(e,t,a){if(a===1||t.itemProp!=null)return!1;switch(e){case"meta":case"title":return!0;case"style":if(typeof t.precedence!="string"||typeof t.href!="string"||t.href==="")break;return!0;case"link":if(typeof t.rel!="string"||typeof t.href!="string"||t.href===""||t.onLoad||t.onError)break;switch(t.rel){case"stylesheet":return e=t.disabled,typeof t.precedence=="string"&&e==null;default:return!0}case"script":if(t.async&&typeof t.async!="function"&&typeof t.async!="symbol"&&!t.onLoad&&!t.onError&&t.src&&typeof t.src=="string")return!0}return!1}function uL(e){return!(e.type==="stylesheet"&&(e.state.loading&3)===0)}function Ok(e,t,a,n){if(a.type==="stylesheet"&&(typeof n.media!="string"||matchMedia(n.media).matches!==!1)&&(a.state.loading&4)===0){if(a.instance===null){var l=Xr(n.href),r=t.querySelector(bi(l));if(r){t=r._p,t!==null&&typeof t=="object"&&typeof t.then=="function"&&(e.count++,e=Cs.bind(e),t.then(e,e)),a.state.loading|=4,a.instance=r,tt(r);return}r=t.ownerDocument||t,n=iL(n),(l=ua.get(l))&&Dp(n,l),r=r.createElement("link"),tt(r);var o=r;o._p=new Promise(function(i,u){o.onload=i,o.onerror=u}),ft(r,"link",n),a.instance=r}e.stylesheets===null&&(e.stylesheets=new Map),e.stylesheets.set(a,t),(t=a.state.preload)&&(a.state.loading&3)===0&&(e.count++,a=Cs.bind(e),t.addEventListener("load",a),t.addEventListener("error",a))}}var Gf=0;function Nk(e,t){return e.stylesheets&&e.count===0&&Ku(e,e.stylesheets),0<e.count||0<e.imgCount?function(a){var n=setTimeout(function(){if(e.stylesheets&&Ku(e,e.stylesheets),e.unsuspend){var r=e.unsuspend;e.unsuspend=null,r()}},6e4+t);0<e.imgBytes&&Gf===0&&(Gf=62500*gk());var l=setTimeout(function(){if(e.waitingForImages=!1,e.count===0&&(e.stylesheets&&Ku(e,e.stylesheets),e.unsuspend)){var r=e.unsuspend;e.unsuspend=null,r()}},(e.imgBytes>Gf?50:800)+t);return e.unsuspend=a,function(){e.unsuspend=null,clearTimeout(n),clearTimeout(l)}}:null}function Cs(){if(this.count--,this.count===0&&(this.imgCount===0||!this.waitingForImages)){if(this.stylesheets)Ku(this,this.stylesheets);else if(this.unsuspend){var e=this.unsuspend;this.unsuspend=null,e()}}}var Ss=null;function Ku(e,t){e.stylesheets=null,e.unsuspend!==null&&(e.count++,Ss=new Map,t.forEach(qk,e),Ss=null,Cs.call(e))}function qk(e,t){if(!(t.state.loading&4)){var a=Ss.get(e);if(a)var n=a.get(null);else{a=new Map,Ss.set(e,a);for(var l=e.querySelectorAll("link[data-precedence],style[data-precedence]"),r=0;r<l.length;r++){var o=l[r];(o.nodeName==="LINK"||o.getAttribute("media")!=="not all")&&(a.set(o.dataset.precedence,o),n=o)}n&&a.set(null,n)}l=t.instance,o=l.getAttribute("data-precedence"),r=a.get(o)||n,r===n&&a.set(null,l),a.set(o,l),this.count++,n=Cs.bind(this),l.addEventListener("load",n),l.addEventListener("error",n),r?r.parentNode.insertBefore(l,r.nextSibling):(e=e.nodeType===9?e.head:e,e.insertBefore(l,e.firstChild)),t.state.loading|=4}}var ii={$$typeof:$a,Provider:null,Consumer:null,_currentValue:yl,_currentValue2:yl,_threadCount:0};function Uk(e,t,a,n,l,r,o,i,u){this.tag=1,this.containerInfo=e,this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.next=this.pendingContext=this.context=this.cancelPendingCommit=null,this.callbackPriority=0,this.expirationTimes=hf(-1),this.entangledLanes=this.shellSuspendCounter=this.errorRecoveryDisabledLanes=this.expiredLanes=this.warmLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=hf(0),this.hiddenUpdates=hf(null),this.identifierPrefix=n,this.onUncaughtError=l,this.onCaughtError=r,this.onRecoverableError=o,this.pooledCache=null,this.pooledCacheLanes=0,this.formState=u,this.incompleteTransitions=new Map}function sL(e,t,a,n,l,r,o,i,u,c,s,f){return e=new Uk(e,t,a,o,u,c,s,f,i),t=1,r===!0&&(t|=24),r=_t(3,null,null,t),e.current=r,r.stateNode=e,t=ap(),t.refCount++,e.pooledCache=t,t.refCount++,r.memoizedState={element:n,isDehydrated:a,cache:t},rp(r),e}function cL(e){return e?(e=Ir,e):Ir}function fL(e,t,a,n,l,r){l=cL(l),n.context===null?n.context=l:n.pendingContext=l,n=Un(t),n.payload={element:a},r=r===void 0?null:r,r!==null&&(n.callback=r),a=Pn(e,n,t),a!==null&&(Mt(a,e,t),Ho(a,e,t))}function kx(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var a=e.retryLane;e.retryLane=a!==0&&a<t?a:t}}function Ep(e,t){kx(e,t),(e=e.alternate)&&kx(e,t)}function dL(e){if(e.tag===13||e.tag===31){var t=El(e,67108864);t!==null&&Mt(t,e,67108864),Ep(e,67108864)}}function wx(e){if(e.tag===13||e.tag===31){var t=Qt();t=_d(t);var a=El(e,t);a!==null&&Mt(a,e,t),Ep(e,t)}}var ks=!0;function Pk(e,t,a,n){var l=W.T;W.T=null;var r=xe.p;try{xe.p=2,zp(e,t,a,n)}finally{xe.p=r,W.T=l}}function Fk(e,t,a,n){var l=W.T;W.T=null;var r=xe.p;try{xe.p=8,zp(e,t,a,n)}finally{xe.p=r,W.T=l}}function zp(e,t,a,n){if(ks){var l=qd(n);if(l===null)Hf(e,t,n,ws,a),Ix(e,n);else if(_k(l,e,t,a,n))n.stopPropagation();else if(Ix(e,n),t&4&&-1<Hk.indexOf(e)){for(;l!==null;){var r=Kr(l);if(r!==null)switch(r.tag){case 3:if(r=r.stateNode,r.current.memoizedState.isDehydrated){var o=hl(r.pendingLanes);if(o!==0){var i=r;for(i.pendingLanes|=2,i.entangledLanes|=2;o;){var u=1<<31-Xt(o);i.entanglements[1]|=u,o&=~u}Ea(r),(ge&6)===0&&(ms=Vt()+500,Li(0,!1))}}break;case 31:case 13:i=El(r,2),i!==null&&Mt(i,r,2),Us(),Ep(r,2)}if(r=qd(n),r===null&&Hf(e,t,n,ws,a),r===l)break;l=r}l!==null&&n.stopPropagation()}else Hf(e,t,n,null,a)}}function qd(e){return e=Xd(e),Bp(e)}var ws=null;function Bp(e){if(ws=null,e=br(e),e!==null){var t=ci(e);if(t===null)e=null;else{var a=t.tag;if(a===13){if(e=zx(t),e!==null)return e;e=null}else if(a===31){if(e=Bx(t),e!==null)return e;e=null}else if(a===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null)}}return ws=e,null}function pL(e){switch(e){case"beforetoggle":case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"toggle":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 2;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 8;case"message":switch(TC()){case qx:return 2;case Ux:return 8;case es:case DC:return 32;case Px:return 268435456;default:return 32}default:return 32}}var Ud=!1,_n=null,Gn=null,Vn=null,ui=new Map,si=new Map,Mn=[],Hk="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");function Ix(e,t){switch(e){case"focusin":case"focusout":_n=null;break;case"dragenter":case"dragleave":Gn=null;break;case"mouseover":case"mouseout":Vn=null;break;case"pointerover":case"pointerout":ui.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":si.delete(t.pointerId)}}function Mo(e,t,a,n,l,r){return e===null||e.nativeEvent!==r?(e={blockedOn:t,domEventName:a,eventSystemFlags:n,nativeEvent:r,targetContainers:[l]},t!==null&&(t=Kr(t),t!==null&&dL(t)),e):(e.eventSystemFlags|=n,t=e.targetContainers,l!==null&&t.indexOf(l)===-1&&t.push(l),e)}function _k(e,t,a,n,l){switch(t){case"focusin":return _n=Mo(_n,e,t,a,n,l),!0;case"dragenter":return Gn=Mo(Gn,e,t,a,n,l),!0;case"mouseover":return Vn=Mo(Vn,e,t,a,n,l),!0;case"pointerover":var r=l.pointerId;return ui.set(r,Mo(ui.get(r)||null,e,t,a,n,l)),!0;case"gotpointercapture":return r=l.pointerId,si.set(r,Mo(si.get(r)||null,e,t,a,n,l)),!0}return!1}function mL(e){var t=br(e.target);if(t!==null){var a=ci(t);if(a!==null){if(t=a.tag,t===13){if(t=zx(a),t!==null){e.blockedOn=t,sg(e.priority,function(){wx(a)});return}}else if(t===31){if(t=Bx(a),t!==null){e.blockedOn=t,sg(e.priority,function(){wx(a)});return}}else if(t===3&&a.stateNode.current.memoizedState.isDehydrated){e.blockedOn=a.tag===3?a.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Zu(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var a=qd(e.nativeEvent);if(a===null){a=e.nativeEvent;var n=new a.constructor(a.type,a);ad=n,a.target.dispatchEvent(n),ad=null}else return t=Kr(a),t!==null&&dL(t),e.blockedOn=a,!1;t.shift()}return!0}function Ax(e,t,a){Zu(e)&&a.delete(t)}function Gk(){Ud=!1,_n!==null&&Zu(_n)&&(_n=null),Gn!==null&&Zu(Gn)&&(Gn=null),Vn!==null&&Zu(Vn)&&(Vn=null),ui.forEach(Ax),si.forEach(Ax)}function Ru(e,t){e.blockedOn===t&&(e.blockedOn=null,Ud||(Ud=!0,We.unstable_scheduleCallback(We.unstable_NormalPriority,Gk)))}var Ou=null;function Tx(e){Ou!==e&&(Ou=e,We.unstable_scheduleCallback(We.unstable_NormalPriority,function(){Ou===e&&(Ou=null);for(var t=0;t<e.length;t+=3){var a=e[t],n=e[t+1],l=e[t+2];if(typeof n!="function"){if(Bp(n||a)===null)continue;break}var r=Kr(a);r!==null&&(e.splice(t,3),t-=3,yd(r,{pending:!0,data:l,method:a.method,action:n},n,l))}}))}function Qr(e){function t(u){return Ru(u,e)}_n!==null&&Ru(_n,e),Gn!==null&&Ru(Gn,e),Vn!==null&&Ru(Vn,e),ui.forEach(t),si.forEach(t);for(var a=0;a<Mn.length;a++){var n=Mn[a];n.blockedOn===e&&(n.blockedOn=null)}for(;0<Mn.length&&(a=Mn[0],a.blockedOn===null);)mL(a),a.blockedOn===null&&Mn.shift();if(a=(e.ownerDocument||e).$$reactFormReplay,a!=null)for(n=0;n<a.length;n+=3){var l=a[n],r=a[n+1],o=l[Et]||null;if(typeof r=="function")o||Tx(a);else if(o){var i=null;if(r&&r.hasAttribute("formAction")){if(l=r,o=r[Et]||null)i=o.formAction;else if(Bp(l)!==null)continue}else i=o.action;typeof i=="function"?a[n+1]=i:(a.splice(n,3),n-=3),Tx(a)}}}function hL(){function e(r){r.canIntercept&&r.info==="react-transition"&&r.intercept({handler:function(){return new Promise(function(o){return l=o})},focusReset:"manual",scroll:"manual"})}function t(){l!==null&&(l(),l=null),n||setTimeout(a,20)}function a(){if(!n&&!navigation.transition){var r=navigation.currentEntry;r&&r.url!=null&&navigation.navigate(r.url,{state:r.getState(),info:"react-transition",history:"replace"})}}if(typeof navigation=="object"){var n=!1,l=null;return navigation.addEventListener("navigate",e),navigation.addEventListener("navigatesuccess",t),navigation.addEventListener("navigateerror",t),setTimeout(a,100),function(){n=!0,navigation.removeEventListener("navigate",e),navigation.removeEventListener("navigatesuccess",t),navigation.removeEventListener("navigateerror",t),l!==null&&(l(),l=null)}}}function Rp(e){this._internalRoot=e}Hs.prototype.render=Rp.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(M(409));var a=t.current,n=Qt();fL(a,n,e,t,null,null)};Hs.prototype.unmount=Rp.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;fL(e.current,2,null,e,null,null),Us(),t[Yr]=null}};function Hs(e){this._internalRoot=e}Hs.prototype.unstable_scheduleHydration=function(e){if(e){var t=Vx();e={blockedOn:null,target:e,priority:t};for(var a=0;a<Mn.length&&t!==0&&t<Mn[a].priority;a++);Mn.splice(a,0,e),a===0&&mL(e)}};var Dx=Mx.version;if(Dx!=="19.2.3")throw Error(M(527,Dx,"19.2.3"));xe.findDOMNode=function(e){var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(M(188)):(e=Object.keys(e).join(","),Error(M(268,e)));return e=vC(t),e=e!==null?Rx(e):null,e=e===null?null:e.stateNode,e};var Vk={bundleType:0,version:"19.2.3",rendererPackageName:"react-dom",currentDispatcherRef:W,reconcilerVersion:"19.2.3"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"&&(Eo=__REACT_DEVTOOLS_GLOBAL_HOOK__,!Eo.isDisabled&&Eo.supportsFiber))try{fi=Eo.inject(Vk),jt=Eo}catch{}var Eo;_s.createRoot=function(e,t){if(!Ex(e))throw Error(M(299));var a=!1,n="",l=o1,r=i1,o=u1;return t!=null&&(t.unstable_strictMode===!0&&(a=!0),t.identifierPrefix!==void 0&&(n=t.identifierPrefix),t.onUncaughtError!==void 0&&(l=t.onUncaughtError),t.onCaughtError!==void 0&&(r=t.onCaughtError),t.onRecoverableError!==void 0&&(o=t.onRecoverableError)),t=sL(e,1,!1,null,null,a,n,null,l,r,o,hL),e[Yr]=t.current,Tp(e),new Rp(t)};_s.hydrateRoot=function(e,t,a){if(!Ex(e))throw Error(M(299));var n=!1,l="",r=o1,o=i1,i=u1,u=null;return a!=null&&(a.unstable_strictMode===!0&&(n=!0),a.identifierPrefix!==void 0&&(l=a.identifierPrefix),a.onUncaughtError!==void 0&&(r=a.onUncaughtError),a.onCaughtError!==void 0&&(o=a.onCaughtError),a.onRecoverableError!==void 0&&(i=a.onRecoverableError),a.formState!==void 0&&(u=a.formState)),t=sL(e,1,!0,t,a??null,n,l,u,r,o,i,hL),t.context=cL(null),a=t.current,n=Qt(),n=_d(n),l=Un(n),l.callback=null,Pn(a,l,n),a=n,t.current.lanes=a,pi(t,a),Ea(t),e[Yr]=t.current,Tp(e),new Hs(t)};_s.version="19.2.3"});var LL=Lt((iM,yL)=>{"use strict";function xL(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(xL)}catch(e){console.error(e)}}xL(),yL.exports=gL()});var IL=Lt(Xs=>{"use strict";var eI=Symbol.for("react.transitional.element"),tI=Symbol.for("react.fragment");function wL(e,t,a){var n=null;if(a!==void 0&&(n=""+a),t.key!==void 0&&(n=""+t.key),"key"in t){a={};for(var l in t)l!=="key"&&(a[l]=t[l])}else a=t;return t=a.ref,{$$typeof:eI,type:e,key:n,ref:t!==void 0?t:null,props:a}}Xs.Fragment=tI;Xs.jsx=wL;Xs.jsxs=wL});var ye=Lt((VB,AL)=>{"use strict";AL.exports=IL()});var _L=Lt((aR,HL)=>{"use strict";var qL=/\/\*[^*]*\*+([^/*][^*]*\*+)*\//g,fI=/\n/g,dI=/^\s*/,pI=/^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/,mI=/^:\s*/,hI=/^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/,gI=/^[;\s]*/,xI=/^\s+|\s+$/g,yI=`
`,UL="/",PL="*",Ql="",LI="comment",bI="declaration";function vI(e,t){if(typeof e!="string")throw new TypeError("First argument must be a string");if(!e)return[];t=t||{};var a=1,n=1;function l(g){var y=g.match(fI);y&&(a+=y.length);var w=g.lastIndexOf(yI);n=~w?g.length-w:n+g.length}function r(){var g={line:a,column:n};return function(y){return y.position=new o(g),c(),y}}function o(g){this.start=g,this.end={line:a,column:n},this.source=t.source}o.prototype.content=e;function i(g){var y=new Error(t.source+":"+a+":"+n+": "+g);if(y.reason=g,y.filename=t.source,y.line=a,y.column=n,y.source=e,!t.silent)throw y}function u(g){var y=g.exec(e);if(y){var w=y[0];return l(w),e=e.slice(w.length),y}}function c(){u(dI)}function s(g){var y;for(g=g||[];y=f();)y!==!1&&g.push(y);return g}function f(){var g=r();if(!(UL!=e.charAt(0)||PL!=e.charAt(1))){for(var y=2;Ql!=e.charAt(y)&&(PL!=e.charAt(y)||UL!=e.charAt(y+1));)++y;if(y+=2,Ql===e.charAt(y-1))return i("End of comment missing");var w=e.slice(2,y-2);return n+=2,l(w),e=e.slice(y),n+=2,g({type:LI,comment:w})}}function d(){var g=r(),y=u(pI);if(y){if(f(),!u(mI))return i("property missing ':'");var w=u(hI),x=g({type:bI,property:FL(y[0].replace(qL,Ql)),value:w?FL(w[0].replace(qL,Ql)):Ql});return u(gI),x}}function p(){var g=[];s(g);for(var y;y=d();)y!==!1&&(g.push(y),s(g));return g}return c(),p()}function FL(e){return e?e.replace(xI,Ql):Ql}HL.exports=vI});var GL=Lt(Qi=>{"use strict";var CI=Qi&&Qi.__importDefault||function(e){return e&&e.__esModule?e:{default:e}};Object.defineProperty(Qi,"__esModule",{value:!0});Qi.default=kI;var SI=CI(_L());function kI(e,t){let a=null;if(!e||typeof e!="string")return a;let n=(0,SI.default)(e),l=typeof t=="function";return n.forEach(r=>{if(r.type!=="declaration")return;let{property:o,value:i}=r;l?t(o,i,r):i&&(a=a||{},a[o]=i)}),a}});var jL=Lt(Ws=>{"use strict";Object.defineProperty(Ws,"__esModule",{value:!0});Ws.camelCase=void 0;var wI=/^--[a-zA-Z0-9_-]+$/,II=/-([a-z])/g,AI=/^[^-]+$/,TI=/^-(webkit|moz|ms|o|khtml)-/,DI=/^-(ms)-/,MI=function(e){return!e||AI.test(e)||wI.test(e)},EI=function(e,t){return t.toUpperCase()},VL=function(e,t){return"".concat(t,"-")},zI=function(e,t){return t===void 0&&(t={}),MI(e)?e:(e=e.toLowerCase(),t.reactCompat?e=e.replace(DI,VL):e=e.replace(TI,VL),e.replace(II,EI))};Ws.camelCase=zI});var QL=Lt((Qp,XL)=>{"use strict";var BI=Qp&&Qp.__importDefault||function(e){return e&&e.__esModule?e:{default:e}},RI=BI(GL()),OI=jL();function Xp(e,t){var a={};return!e||typeof e!="string"||(0,RI.default)(e,function(n,l){n&&l&&(a[(0,OI.camelCase)(n,t)]=l)}),a}Xp.default=Xp;XL.exports=Xp});var yv=Lt((U6,xv)=>{"use strict";var Cc=Object.prototype.hasOwnProperty,gv=Object.prototype.toString,cv=Object.defineProperty,fv=Object.getOwnPropertyDescriptor,dv=function(t){return typeof Array.isArray=="function"?Array.isArray(t):gv.call(t)==="[object Array]"},pv=function(t){if(!t||gv.call(t)!=="[object Object]")return!1;var a=Cc.call(t,"constructor"),n=t.constructor&&t.constructor.prototype&&Cc.call(t.constructor.prototype,"isPrototypeOf");if(t.constructor&&!a&&!n)return!1;var l;for(l in t);return typeof l>"u"||Cc.call(t,l)},mv=function(t,a){cv&&a.name==="__proto__"?cv(t,a.name,{enumerable:!0,configurable:!0,value:a.newValue,writable:!0}):t[a.name]=a.newValue},hv=function(t,a){if(a==="__proto__")if(Cc.call(t,a)){if(fv)return fv(t,a).value}else return;return t[a]};xv.exports=function e(){var t,a,n,l,r,o,i=arguments[0],u=1,c=arguments.length,s=!1;for(typeof i=="boolean"&&(s=i,i=arguments[1]||{},u=2),(i==null||typeof i!="object"&&typeof i!="function")&&(i={});u<c;++u)if(t=arguments[u],t!=null)for(a in t)n=hv(i,a),l=hv(t,a),i!==l&&(s&&l&&(pv(l)||(r=dv(l)))?(r?(r=!1,o=n&&dv(n)?n:[]):o=n&&pv(n)?n:{},mv(i,{name:a,newValue:e(s,o,l)})):typeof l<"u"&&mv(i,{name:a,newValue:l}));return i}});var P0=J(je(),1),F0=J(LL(),1);var ka=J(je(),1);var Vs=J(je());var bL=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),jk=e=>e.replace(/^([A-Z])|[\s-_]+(\w)/g,(t,a,n)=>n?n.toUpperCase():a.toLowerCase()),Op=e=>{let t=jk(e);return t.charAt(0).toUpperCase()+t.slice(1)},Gs=(...e)=>e.filter((t,a,n)=>!!t&&t.trim()!==""&&n.indexOf(t)===a).join(" ").trim(),vL=e=>{for(let t in e)if(t.startsWith("aria-")||t==="role"||t==="title")return!0};var Ci=J(je());var CL={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};var SL=(0,Ci.forwardRef)(({color:e="currentColor",size:t=24,strokeWidth:a=2,absoluteStrokeWidth:n,className:l="",children:r,iconNode:o,...i},u)=>(0,Ci.createElement)("svg",{ref:u,...CL,width:t,height:t,stroke:e,strokeWidth:n?Number(a)*24/Number(t):a,className:Gs("lucide",l),...!r&&!vL(i)&&{"aria-hidden":"true"},...i},[...o.map(([c,s])=>(0,Ci.createElement)(c,s)),...Array.isArray(r)?r:[r]]));var A=(e,t)=>{let a=(0,Vs.forwardRef)(({className:n,...l},r)=>(0,Vs.createElement)(SL,{ref:r,iconNode:t,className:Gs(`lucide-${bL(Op(e))}`,`lucide-${e}`,n),...l}));return a.displayName=Op(e),a};var Xk=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]],sa=A("activity",Xk);var Qk=[["rect",{width:"20",height:"5",x:"2",y:"3",rx:"1",key:"1wp1u1"}],["path",{d:"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",key:"1s80jp"}],["path",{d:"M10 12h4",key:"a56b0p"}]],Si=A("archive",Qk);var Yk=[["path",{d:"M12 5v14",key:"s699le"}],["path",{d:"m19 12-7 7-7-7",key:"1idqje"}]],ki=A("arrow-down",Yk);var Kk=[["path",{d:"M7 7h10v10",key:"1tivn9"}],["path",{d:"M7 17 17 7",key:"1vkiza"}]],ca=A("arrow-up-right",Kk);var Zk=[["path",{d:"m5 12 7-7 7 7",key:"hav0vg"}],["path",{d:"M12 19V5",key:"x0mq9r"}]],Bl=A("arrow-up",Zk);var Jk=[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]],za=A("book-open",Jk);var Wk=[["path",{d:"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",key:"l5xja"}],["path",{d:"M9 13a4.5 4.5 0 0 0 3-4",key:"10igwf"}],["path",{d:"M6.003 5.125A3 3 0 0 0 6.401 6.5",key:"105sqy"}],["path",{d:"M3.477 10.896a4 4 0 0 1 .585-.396",key:"ql3yin"}],["path",{d:"M6 18a4 4 0 0 1-1.967-.516",key:"2e4loj"}],["path",{d:"M12 13h4",key:"1ku699"}],["path",{d:"M12 18h6a2 2 0 0 1 2 2v1",key:"105ag5"}],["path",{d:"M12 8h8",key:"1lhi5i"}],["path",{d:"M16 8V5a2 2 0 0 1 2-2",key:"u6izg6"}],["circle",{cx:"16",cy:"13",r:".5",key:"ry7gng"}],["circle",{cx:"18",cy:"3",r:".5",key:"1aiba7"}],["circle",{cx:"20",cy:"21",r:".5",key:"yhc1fs"}],["circle",{cx:"20",cy:"8",r:".5",key:"1e43v0"}]],wi=A("brain-circuit",Wk);var $k=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],Bt=A("check",$k);var ew=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],Ii=A("chevron-down",ew);var tw=[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]],Ai=A("chevron-left",tw);var aw=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],Rl=A("chevron-right",aw);var nw=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]],Jn=A("circle-alert",nw);var lw=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]],Ti=A("circle",lw);var rw=[["path",{d:"M12 6v6h4",key:"135r8i"}],["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]],Di=A("clock-3",rw);var ow=[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]],Wn=A("code-xml",ow);var iw=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]],Ol=A("copy",iw);var uw=[["path",{d:"M20 4v7a4 4 0 0 1-4 4H4",key:"6o5b7l"}],["path",{d:"m9 10-5 5 5 5",key:"1kshq7"}]],Mi=A("corner-down-left",uw);var sw=[["path",{d:"M12 15V3",key:"m9g1x1"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["path",{d:"m7 10 5 5 5-5",key:"brsn70"}]],$n=A("download",sw);var cw=[["circle",{cx:"12",cy:"12",r:"1",key:"41hilf"}],["circle",{cx:"19",cy:"12",r:"1",key:"1wjl8i"}],["circle",{cx:"5",cy:"12",r:"1",key:"1pcz8c"}]],el=A("ellipsis",cw);var fw=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],Nl=A("external-link",fw);var dw=[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],to=A("eye",dw);var pw=[["path",{d:"M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35",key:"1wthlu"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"m5 16-3 3 3 3",key:"331omg"}],["path",{d:"m9 22 3-3-3-3",key:"lsp7cz"}]],Ba=A("file-code-corner",pw);var mw=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M8 13h2",key:"yr2amv"}],["path",{d:"M14 13h2",key:"un5t4a"}],["path",{d:"M8 17h2",key:"2yhykz"}],["path",{d:"M14 17h2",key:"10kma7"}]],Ei=A("file-spreadsheet",mw);var hw=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],Ge=A("file-text",hw);var gw=[["path",{d:"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",key:"usdka0"}]],zi=A("folder-open",gw);var xw=[["path",{d:"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",key:"sc7q7i"}]],tl=A("funnel",xw);var yw=[["line",{x1:"6",x2:"6",y1:"3",y2:"15",key:"17qcm7"}],["circle",{cx:"18",cy:"6",r:"3",key:"1h7g24"}],["circle",{cx:"6",cy:"18",r:"3",key:"fqmcym"}],["path",{d:"M18 9a9 9 0 0 1-9 9",key:"n2h4wq"}]],dn=A("git-branch",yw);var Lw=[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",key:"j76jl0"}],["path",{d:"M22 10v6",key:"1lu8f3"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5",key:"1r8lef"}]],ql=A("graduation-cap",Lw);var bw=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}],["path",{d:"M12 7v5l4 2",key:"1fdv2h"}]],Bi=A("history",bw);var vw=[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",key:"zw3jo"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",key:"1wduqc"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",key:"kqbvx6"}]],fa=A("layers",vw);var Cw=[["path",{d:"M13 5h8",key:"a7qcls"}],["path",{d:"M13 12h8",key:"h98zly"}],["path",{d:"M13 19h8",key:"c3s6r1"}],["path",{d:"m3 17 2 2 4-4",key:"1jhpwq"}],["rect",{x:"3",y:"4",width:"6",height:"6",rx:"1",key:"cif1o7"}]],Ra=A("list-todo",Cw);var Sw=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],St=A("loader-circle",Sw);var kw=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"m21 3-7 7",key:"1l2asr"}],["path",{d:"m3 21 7-7",key:"tjx5ai"}],["path",{d:"M9 21H3v-6",key:"wtvkvv"}]],Ul=A("maximize-2",kw);var ww=[["path",{d:"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",key:"18887p"}]],pn=A("message-square",ww);var Iw=[["path",{d:"m14 10 7-7",key:"oa77jy"}],["path",{d:"M20 10h-6V4",key:"mjg0md"}],["path",{d:"m3 21 7-7",key:"tjx5ai"}],["path",{d:"M4 14h6v6",key:"rmj7iw"}]],Pl=A("minimize-2",Iw);var Aw=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],Ri=A("monitor",Aw);var Tw=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",key:"kfwtm"}]],Oi=A("moon",Tw);var Dw=[["path",{d:"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z",key:"edeuup"}]],Ni=A("mouse-pointer-2",Dw);var Mw=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m16 15-3-3 3-3",key:"14y99z"}]],al=A("panel-left-close",Mw);var Ew=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}]],mn=A("panel-left",Ew);var zw=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M15 3v18",key:"14nvp0"}]],Fl=A("panel-right",zw);var Bw=[["path",{d:"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551",key:"1miecu"}]],nl=A("paperclip",Bw);var Rw=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}],["path",{d:"m15 5 4 4",key:"1mk7zo"}]],Hl=A("pencil",Rw);var Ow=[["path",{d:"M12 17v5",key:"bb1du9"}],["path",{d:"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",key:"1nkz8b"}]],ao=A("pin",Ow);var Nw=[["path",{d:"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",key:"10ikf1"}]],hn=A("play",Nw);var qw=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],Oa=A("plus",qw);var Uw=[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]],qi=A("refresh-cw",Uw);var Pw=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],gn=A("rotate-ccw",Pw);var Fw=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],da=A("search",Fw);var Hw=[["path",{d:"M14 17H5",key:"gfn3mx"}],["path",{d:"M19 7h-9",key:"6i9tg"}],["circle",{cx:"17",cy:"17",r:"3",key:"18b49y"}],["circle",{cx:"7",cy:"7",r:"3",key:"dfmy0x"}]],Ui=A("settings-2",Hw);var _w=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],no=A("shield-check",_w);var Gw=[["path",{d:"M10 5H3",key:"1qgfaw"}],["path",{d:"M12 19H3",key:"yhmn1j"}],["path",{d:"M14 3v4",key:"1sua03"}],["path",{d:"M16 17v4",key:"1q0r14"}],["path",{d:"M21 12h-9",key:"1o4lsq"}],["path",{d:"M21 19h-5",key:"1rlt1p"}],["path",{d:"M21 5h-7",key:"1oszz2"}],["path",{d:"M8 10v4",key:"tgpxqk"}],["path",{d:"M8 12H3",key:"a7s4jb"}]],_l=A("sliders-horizontal",Gw);var Vw=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]],pa=A("sparkles",Vw);var jw=[["path",{d:"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",key:"1m0v6g"}],["path",{d:"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",key:"ohrbg2"}]],ht=A("square-pen",jw);var Xw=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}]],Gl=A("square",Xw);var Qw=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],Pi=A("sun",Qw);var Yw=[["path",{d:"M12 19h8",key:"baeox8"}],["path",{d:"m4 17 6-6-6-6",key:"1yngyt"}]],Vl=A("terminal",Yw);var Kw=[["path",{d:"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",key:"ul74o6"}],["path",{d:"m14 7 3 3",key:"1r5n42"}],["path",{d:"M5 6v4",key:"ilb8ba"}],["path",{d:"M19 14v4",key:"blhpug"}],["path",{d:"M10 2v2",key:"7u0qdc"}],["path",{d:"M7 8H3",key:"zfb6yr"}],["path",{d:"M21 16h-4",key:"1cnmox"}],["path",{d:"M11 3H9",key:"1obp7u"}]],Rt=A("wand-sparkles",Kw);var Zw=[["path",{d:"M12 20h.01",key:"zekei9"}],["path",{d:"M8.5 16.429a5 5 0 0 1 7 0",key:"1bycff"}],["path",{d:"M5 12.859a10 10 0 0 1 5.17-2.69",key:"1dl1wf"}],["path",{d:"M19 12.859a10 10 0 0 0-2.007-1.523",key:"4k23kn"}],["path",{d:"M2 8.82a15 15 0 0 1 4.177-2.643",key:"1grhjp"}],["path",{d:"M22 8.82a15 15 0 0 0-11.288-3.764",key:"z3jwby"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]],Fi=A("wifi-off",Zw);var Jw=[["rect",{width:"8",height:"8",x:"3",y:"3",rx:"2",key:"by2w9f"}],["path",{d:"M7 11v4a2 2 0 0 0 2 2h4",key:"xkn7yn"}],["rect",{width:"8",height:"8",x:"13",y:"13",rx:"2",key:"1cgmvn"}]],ll=A("workflow",Jw);var Ww=[["path",{d:"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z",key:"1ngwbx"}]],Hi=A("wrench",Ww);var $w=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],Re=A("x",$w);var lo=J(je(),1),Np=(0,lo.createContext)(null);function ce(){let e=(0,lo.useContext)(Np);if(!e)throw new Error("\u5DE5\u4F5C\u53F0\u672A\u521D\u59CB\u5316");return{controller:e,state:(0,lo.useSyncExternalStore)(e.subscribe,e.snapshot)}}var Vi=J(je(),1);var Gi=J(je(),1);var nt=e=>["SUCCEEDED","FAILED","CANCELED"].includes(e.status),js=e=>e.length>0&&e.every(t=>t.type==="material"),kL={WAITING_INPUT:"\u5F85\u56DE\u7B54",QUEUED:"\u7B49\u5F85\u6267\u884C",RUNNING:"\u6267\u884C\u4E2D",CANCEL_REQUESTED:"\u6B63\u5728\u505C\u6B62",SUCCEEDED:"\u5DF2\u5B8C\u6210",FAILED:"\u672A\u5B8C\u6210",CANCELED:"\u5DF2\u505C\u6B62",NEEDS_REVIEW:"\u5F85\u5BA1\u9605",DRAFT:"\u8349\u7A3F",PUBLISHED:"\u5DF2\u53D1\u5E03",GENERATING:"\u751F\u6210\u4E2D",completed:"\u5DF2\u5B8C\u6210",running:"\u6267\u884C\u4E2D",failed:"\u672A\u5B8C\u6210",cancelled:"\u5DF2\u505C\u6B62",incomplete:"\u8BB0\u5F55\u4E0D\u5B8C\u6574"},_i={"learning-flow":"\u6D41\u7A0B\u63A2\u7A76\u5F0F\u5B66\u4E60",simulation:"\u4EA4\u4E92\u6F14\u793A","slide-deck":"\u8BFE\u4EF6","question-set":"\u5B9E\u8DF5\u9898","lesson-plan":"\u6559\u6848","attack-defense-scene":"\u653B\u9632\u6F14\u793A",debate:"AI \u8FA9\u8BBA",assessment:"\u8BC4\u5206\u65B9\u6848","learning-path":"\u5B66\u4E60\u8DEF\u5F84","agent.chat":"\u667A\u80FD\u4F53\u4EFB\u52A1","artifact.revise":"\u5C40\u90E8\u4FEE\u6539","candidate.generate":"\u751F\u6210\u5185\u5BB9"};function Na(e){if(!e)return"";let t=new Date(e.endsWith("Z")||/[+-]\d\d:\d\d$/.test(e)?e:e+"Z");return Number.isNaN(t.getTime())?"":t.toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}var dt=J(ye(),1);function _({children:e,label:t,className:a="",...n}){return(0,dt.jsx)("button",{type:"button",className:`button ${a}`,"aria-label":t,title:t,...n,children:e})}function K(e){return(0,dt.jsx)(_,{...e,className:`icon-button ${e.className||""}`})}function Zt({status:e}){let t=["running","RUNNING","QUEUED","CANCEL_REQUESTED","GENERATING"].includes(e),a=["failed","FAILED","incomplete"].includes(e),n=["completed","SUCCEEDED","PUBLISHED"].includes(e);return(0,dt.jsxs)("span",{className:`status ${t?"running":a?"failed":n?"done":""}`,children:[(0,dt.jsx)(t?St:a?Jn:n?Bt:Ti,{className:t?"spin":"",size:13}),kL[e]||e]})}function qa({icon:e,title:t,children:a}){return(0,dt.jsxs)("div",{className:"empty-state",children:[e,(0,dt.jsx)("strong",{children:t}),a&&(0,dt.jsx)("div",{children:a})]})}function ma({title:e,children:t,onClose:a,wide:n=!1}){let l=(0,Gi.useRef)(null),r=(0,Gi.useRef)(a);return r.current=a,(0,Gi.useEffect)(()=>{let o=l.current.getRootNode(),i=o.activeElement,u=requestAnimationFrame(()=>l.current?.querySelector("[autofocus],input,textarea,button")?.focus()),c=f=>{if(f.key==="Escape"&&(f.stopPropagation(),f.preventDefault(),r.current()),f.key!=="Tab")return;let d=Array.from(l.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')||[]).filter(p=>p.getClientRects().length);if(!d.length){f.preventDefault();return}f.shiftKey&&o.activeElement===d[0]?(f.preventDefault(),d.at(-1)?.focus()):!f.shiftKey&&o.activeElement===d.at(-1)&&(f.preventDefault(),d[0].focus())};l.current?.addEventListener("keydown",c);let s=l.current;return()=>{cancelAnimationFrame(u),s?.removeEventListener("keydown",c),i?.focus()}},[]),(0,dt.jsx)("div",{className:"modal-layer",onMouseDown:o=>{o.target===o.currentTarget&&a()},children:(0,dt.jsxs)("div",{ref:l,className:`dialog ${n?"wide":""}`,role:"dialog","aria-modal":"true","aria-label":e,children:[(0,dt.jsxs)("header",{children:[(0,dt.jsx)("h2",{children:e}),(0,dt.jsx)(K,{label:"\u5173\u95ED",onClick:a,children:(0,dt.jsx)(Re,{size:17})})]}),t]})})}function va({value:e}){let t=typeof e=="string"?e:JSON.stringify(e,null,2);return(0,dt.jsx)("pre",{className:"code",children:(0,dt.jsx)("code",{children:t})})}var X=J(ye(),1);function TL(){let{state:e,controller:t}=ce(),[a,n]=(0,Vi.useState)(null),[l,r]=(0,Vi.useState)(null),[o,i]=(0,Vi.useState)(""),[u,c]=(0,Vi.useState)(t.storage.value("groupByCourse",!1)),s=e.jobs.filter(d=>!nt(d)).length,f=new Map;for(let d of e.threads){let p=e.context.teacherDojos?.find(y=>y.id===d.dojoId),g=d.pinned?"\u7F6E\u9876":u?p?.name||"\u72EC\u7ACB\u521B\u4F5C":"\u6700\u8FD1\u4F1A\u8BDD";f.set(g,[...f.get(g)||[],d])}return(0,X.jsxs)(X.Fragment,{children:[e.sidebarOpen&&(0,X.jsx)("button",{className:"drawer-backdrop","aria-label":"\u5173\u95ED\u5BFC\u822A",onClick:()=>t.patch({sidebarOpen:!1})}),(0,X.jsxs)("aside",{id:"workbench-sidebar",className:`sidebar ${e.sidebarOpen?"open":""}`,"aria-label":"\u4F1A\u8BDD\u5BFC\u822A",children:[(0,X.jsx)(K,{className:"mobile-only sidebar-close",label:"\u5173\u95ED\u5BFC\u822A",onClick:()=>t.patch({sidebarOpen:!1}),children:(0,X.jsx)(al,{size:17})}),(0,X.jsxs)("div",{className:"sidebar-actions",children:[(0,X.jsxs)(_,{className:"new-thread",onClick:()=>t.newThread(),children:[(0,X.jsx)(ht,{size:17}),"\u65B0\u5EFA\u4F1A\u8BDD",(0,X.jsx)("kbd",{children:"Alt N"})]}),(0,X.jsxs)(_,{className:"thread-search",onClick:()=>t.patch({modal:"search"}),children:[(0,X.jsx)(da,{size:17}),"\u641C\u7D22\u4E0E\u547D\u4EE4",(0,X.jsx)("kbd",{children:"\u2318 K"})]}),(0,X.jsxs)(_,{className:e.taskCenter?"selected":"",onClick:()=>t.patch({taskCenter:!0,sidebarOpen:!1}),children:[(0,X.jsx)(Ra,{size:17}),"\u4EFB\u52A1\u4E2D\u5FC3",s>0&&(0,X.jsx)("span",{className:"count",children:s})]}),(0,X.jsxs)("a",{className:"button",href:"/teacher/projects",children:[(0,X.jsx)(zi,{size:17}),"\u5168\u90E8\u6210\u54C1",(0,X.jsx)(ca,{size:14,className:"push"})]})]}),(0,X.jsxs)("div",{className:"sidebar-section-heading",children:[(0,X.jsxs)(_,{onClick:()=>t.filterThreads("",!e.archived),children:[e.archived?"\u5DF2\u5F52\u6863":"\u4F1A\u8BDD",(0,X.jsx)(Ii,{size:13})]}),(0,X.jsx)(K,{label:u?"\u6309\u65F6\u95F4\u6392\u5217":"\u6309\u8BFE\u7A0B\u5206\u7EC4",onClick:()=>{c(!u),t.storage.set("groupByCourse",!u)},children:(0,X.jsx)(ql,{size:16})})]}),(0,X.jsxs)("nav",{className:"thread-list",children:[!e.threads.length&&(0,X.jsx)("p",{className:"quiet sidebar-empty",children:e.archived?"\u6CA1\u6709\u5F52\u6863\u4F1A\u8BDD":"\u5F00\u59CB\u4E00\u6B21\u65B0\u7684\u6559\u5B66\u521B\u4F5C\u3002"}),[...f].map(([d,p])=>(0,X.jsxs)("section",{children:[(0,X.jsx)("h3",{children:d}),p.map(g=>(0,X.jsxs)("div",{className:`thread-row ${e.thread?.id===g.id&&!e.taskCenter?"selected":""}`,children:[(0,X.jsxs)("button",{className:"thread-link",onClick:()=>{n(null),t.activate(g.id).catch(t.error)},title:g.title,children:[g.pinned?(0,X.jsx)(ao,{size:13}):(0,X.jsx)(pn,{size:13}),(0,X.jsxs)("span",{className:"thread-copy",children:[(0,X.jsx)("strong",{children:g.title||"\u65B0\u4F1A\u8BDD"}),g.latestMessage&&(0,X.jsx)("small",{children:g.latestMessage})]}),g.updated&&(0,X.jsx)("time",{title:Na(g.updated),children:Na(g.updated).split(" ")[0]}),e.jobs.some(y=>y.threadId===g.id&&!nt(y))&&(0,X.jsx)("i",{className:"live-dot"})]}),(0,X.jsx)(K,{label:`\u7BA1\u7406\u4F1A\u8BDD\uFF1A${g.title}`,className:"thread-more",onClick:()=>n(a===g.id?null:g.id),children:(0,X.jsx)(el,{size:16})}),a===g.id&&(0,X.jsxs)("div",{className:"thread-menu",role:"menu",children:[(0,X.jsxs)(_,{onClick:()=>{r(g),i(g.title),n(null)},children:[(0,X.jsx)(Hl,{size:14}),"\u91CD\u547D\u540D"]}),(0,X.jsxs)(_,{onClick:()=>{n(null),t.run(()=>t.updateThread(g.id,{pinned:!g.pinned}))},children:[(0,X.jsx)(ao,{size:14}),g.pinned?"\u53D6\u6D88\u7F6E\u9876":"\u7F6E\u9876"]}),(0,X.jsxs)(_,{onClick:()=>{n(null),t.run(()=>t.fork(g.id))},children:[(0,X.jsx)(dn,{size:14}),"\u521B\u5EFA\u5206\u652F"]}),(0,X.jsxs)(_,{onClick:()=>{n(null),t.run(()=>t.updateThread(g.id,{archived:g.status!=="ARCHIVED"}))},children:[(0,X.jsx)(Si,{size:14}),g.status==="ARCHIVED"?"\u6062\u590D\u4F1A\u8BDD":"\u5F52\u6863"]})]})]},g.id))]},d))]})]}),l&&(0,X.jsx)(ma,{title:"\u91CD\u547D\u540D\u4F1A\u8BDD",onClose:()=>r(null),children:(0,X.jsxs)("form",{onSubmit:d=>{d.preventDefault(),t.run(async()=>{await t.updateThread(l.id,{title:o.trim()}),r(null)})},children:[(0,X.jsxs)("label",{className:"field",children:["\u540D\u79F0",(0,X.jsx)("input",{autoFocus:!0,value:o,onChange:d=>i(d.target.value),maxLength:200,required:!0})]}),(0,X.jsxs)("div",{className:"dialog-actions",children:[(0,X.jsx)(_,{onClick:()=>r(null),children:"\u53D6\u6D88"}),(0,X.jsx)("button",{className:"button primary",disabled:!o.trim()||e.busy,children:"\u4FDD\u5B58\u540D\u79F0"})]})]})})]})}var Fe=J(je(),1);function DL(e,t){let a=t||{};return(e[e.length-1]===""?[...e,""]:e).join((a.padRight?" ":"")+","+(a.padLeft===!1?"":" ")).trim()}var aI=/^[$_\p{ID_Start}][$_\u{200C}\u{200D}\p{ID_Continue}]*$/u,nI=/^[$_\p{ID_Start}][-$_\u{200C}\u{200D}\p{ID_Continue}]*$/u,lI={};function Qs(e,t){return((t||lI).jsx?nI:aI).test(e)}var rI=/[ \t\n\f\r]/g;function qp(e){return typeof e=="object"?e.type==="text"?ML(e.value):!1:ML(e)}function ML(e){return e.replace(rI,"")===""}var xn=class{constructor(t,a,n){this.normal=a,this.property=t,n&&(this.space=n)}};xn.prototype.normal={};xn.prototype.property={};xn.prototype.space=void 0;function Up(e,t){let a={},n={};for(let l of e)Object.assign(a,l.property),Object.assign(n,l.normal);return new xn(a,n,t)}function ji(e){return e.toLowerCase()}var lt=class{constructor(t,a){this.attribute=a,this.property=t}};lt.prototype.attribute="";lt.prototype.booleanish=!1;lt.prototype.boolean=!1;lt.prototype.commaOrSpaceSeparated=!1;lt.prototype.commaSeparated=!1;lt.prototype.defined=!1;lt.prototype.mustUseProperty=!1;lt.prototype.number=!1;lt.prototype.overloadedBoolean=!1;lt.prototype.property="";lt.prototype.spaceSeparated=!1;lt.prototype.space=void 0;var Xi={};Dh(Xi,{boolean:()=>ee,booleanish:()=>Ue,commaOrSpaceSeparated:()=>Ot,commaSeparated:()=>yn,number:()=>R,overloadedBoolean:()=>Ys,spaceSeparated:()=>Le});var oI=0,ee=jl(),Ue=jl(),Ys=jl(),R=jl(),Le=jl(),yn=jl(),Ot=jl();function jl(){return 2**++oI}var Pp=Object.keys(Xi),Xl=class extends lt{constructor(t,a,n,l){let r=-1;if(super(t,a),EL(this,"space",l),typeof n=="number")for(;++r<Pp.length;){let o=Pp[r];EL(this,Pp[r],(n&Xi[o])===Xi[o])}}};Xl.prototype.defined=!0;function EL(e,t,a){a&&(e[t]=a)}function ha(e){let t={},a={};for(let[n,l]of Object.entries(e.properties)){let r=new Xl(n,e.transform(e.attributes||{},n),l,e.space);e.mustUseProperty&&e.mustUseProperty.includes(n)&&(r.mustUseProperty=!0),t[n]=r,a[ji(n)]=n,a[ji(r.attribute)]=n}return new xn(t,a,e.space)}var Fp=ha({properties:{ariaActiveDescendant:null,ariaAtomic:Ue,ariaAutoComplete:null,ariaBusy:Ue,ariaChecked:Ue,ariaColCount:R,ariaColIndex:R,ariaColSpan:R,ariaControls:Le,ariaCurrent:null,ariaDescribedBy:Le,ariaDetails:null,ariaDisabled:Ue,ariaDropEffect:Le,ariaErrorMessage:null,ariaExpanded:Ue,ariaFlowTo:Le,ariaGrabbed:Ue,ariaHasPopup:null,ariaHidden:Ue,ariaInvalid:null,ariaKeyShortcuts:null,ariaLabel:null,ariaLabelledBy:Le,ariaLevel:R,ariaLive:null,ariaModal:Ue,ariaMultiLine:Ue,ariaMultiSelectable:Ue,ariaOrientation:null,ariaOwns:Le,ariaPlaceholder:null,ariaPosInSet:R,ariaPressed:Ue,ariaReadOnly:Ue,ariaRelevant:null,ariaRequired:Ue,ariaRoleDescription:Le,ariaRowCount:R,ariaRowIndex:R,ariaRowSpan:R,ariaSelected:Ue,ariaSetSize:R,ariaSort:null,ariaValueMax:R,ariaValueMin:R,ariaValueNow:R,ariaValueText:null,role:null},transform(e,t){return t==="role"?t:"aria-"+t.slice(4).toLowerCase()}});function Ks(e,t){return t in e?e[t]:t}function Zs(e,t){return Ks(e,t.toLowerCase())}var zL=ha({attributes:{acceptcharset:"accept-charset",classname:"class",htmlfor:"for",httpequiv:"http-equiv"},mustUseProperty:["checked","multiple","muted","selected"],properties:{abbr:null,accept:yn,acceptCharset:Le,accessKey:Le,action:null,allow:null,allowFullScreen:ee,allowPaymentRequest:ee,allowUserMedia:ee,alpha:ee,alt:null,as:null,async:ee,autoCapitalize:null,autoComplete:Le,autoFocus:ee,autoPlay:ee,blocking:Le,capture:null,charSet:null,checked:ee,cite:null,className:Le,closedBy:null,colorSpace:null,cols:R,colSpan:R,command:null,commandFor:null,content:null,contentEditable:Ue,controls:ee,controlsList:Le,coords:R|yn,crossOrigin:null,data:null,dateTime:null,decoding:null,default:ee,defer:ee,dir:null,dirName:null,disabled:ee,download:Ys,draggable:Ue,encType:null,enterKeyHint:null,fetchPriority:null,form:null,formAction:null,formEncType:null,formMethod:null,formNoValidate:ee,formTarget:null,headers:Le,height:R,hidden:Ys,high:R,href:null,hrefLang:null,htmlFor:Le,httpEquiv:Le,id:null,imageSizes:null,imageSrcSet:null,inert:ee,inputMode:null,integrity:null,is:null,isMap:ee,itemId:null,itemProp:Le,itemRef:Le,itemScope:ee,itemType:Le,kind:null,label:null,lang:null,language:null,list:null,loading:null,loop:ee,low:R,manifest:null,max:null,maxLength:R,media:null,method:null,min:null,minLength:R,multiple:ee,muted:ee,name:null,nonce:null,noModule:ee,noValidate:ee,onAbort:null,onAfterPrint:null,onAuxClick:null,onBeforeMatch:null,onBeforePrint:null,onBeforeToggle:null,onBeforeUnload:null,onBlur:null,onCancel:null,onCanPlay:null,onCanPlayThrough:null,onChange:null,onClick:null,onClose:null,onContextLost:null,onContextMenu:null,onContextRestored:null,onCopy:null,onCueChange:null,onCut:null,onDblClick:null,onDrag:null,onDragEnd:null,onDragEnter:null,onDragExit:null,onDragLeave:null,onDragOver:null,onDragStart:null,onDrop:null,onDurationChange:null,onEmptied:null,onEnded:null,onError:null,onFocus:null,onFormData:null,onHashChange:null,onInput:null,onInvalid:null,onKeyDown:null,onKeyPress:null,onKeyUp:null,onLanguageChange:null,onLoad:null,onLoadedData:null,onLoadedMetadata:null,onLoadEnd:null,onLoadStart:null,onMessage:null,onMessageError:null,onMouseDown:null,onMouseEnter:null,onMouseLeave:null,onMouseMove:null,onMouseOut:null,onMouseOver:null,onMouseUp:null,onOffline:null,onOnline:null,onPageHide:null,onPageShow:null,onPaste:null,onPause:null,onPlay:null,onPlaying:null,onPopState:null,onProgress:null,onRateChange:null,onRejectionHandled:null,onReset:null,onResize:null,onScroll:null,onScrollEnd:null,onSecurityPolicyViolation:null,onSeeked:null,onSeeking:null,onSelect:null,onSlotChange:null,onStalled:null,onStorage:null,onSubmit:null,onSuspend:null,onTimeUpdate:null,onToggle:null,onUnhandledRejection:null,onUnload:null,onVolumeChange:null,onWaiting:null,onWheel:null,open:ee,optimum:R,pattern:null,ping:Le,placeholder:null,playsInline:ee,popover:null,popoverTarget:null,popoverTargetAction:null,poster:null,preload:null,readOnly:ee,referrerPolicy:null,rel:Le,required:ee,reversed:ee,rows:R,rowSpan:R,sandbox:Le,scope:null,scoped:ee,seamless:ee,selected:ee,shadowRootClonable:ee,shadowRootCustomElementRegistry:ee,shadowRootDelegatesFocus:ee,shadowRootMode:null,shadowRootSerializable:ee,shape:null,size:R,sizes:null,slot:null,span:R,spellCheck:Ue,src:null,srcDoc:null,srcLang:null,srcSet:null,start:R,step:null,style:null,tabIndex:R,target:null,title:null,translate:null,type:null,typeMustMatch:ee,useMap:null,value:Ue,width:R,wrap:null,writingSuggestions:null,align:null,aLink:null,archive:Le,axis:null,background:null,bgColor:null,border:R,borderColor:null,bottomMargin:R,cellPadding:null,cellSpacing:null,char:null,charOff:null,classId:null,clear:null,code:null,codeBase:null,codeType:null,color:null,compact:ee,declare:ee,event:null,face:null,frame:null,frameBorder:null,hSpace:R,leftMargin:R,link:null,longDesc:null,lowSrc:null,marginHeight:R,marginWidth:R,noResize:ee,noHref:ee,noShade:ee,noWrap:ee,object:null,profile:null,prompt:null,rev:null,rightMargin:R,rules:null,scheme:null,scrolling:Ue,standby:null,summary:null,text:null,topMargin:R,valueType:null,version:null,vAlign:null,vLink:null,vSpace:R,allowTransparency:null,autoCorrect:null,autoSave:null,credentialless:ee,disablePictureInPicture:ee,disableRemotePlayback:ee,exportParts:yn,part:Le,prefix:null,property:null,results:R,security:null,unselectable:null},space:"html",transform:Zs});var BL=ha({attributes:{accentHeight:"accent-height",alignmentBaseline:"alignment-baseline",arabicForm:"arabic-form",baselineShift:"baseline-shift",capHeight:"cap-height",className:"class",clipPath:"clip-path",clipRule:"clip-rule",colorInterpolation:"color-interpolation",colorInterpolationFilters:"color-interpolation-filters",colorProfile:"color-profile",colorRendering:"color-rendering",crossOrigin:"crossorigin",dataType:"datatype",dominantBaseline:"dominant-baseline",enableBackground:"enable-background",fillOpacity:"fill-opacity",fillRule:"fill-rule",floodColor:"flood-color",floodOpacity:"flood-opacity",fontFamily:"font-family",fontSize:"font-size",fontSizeAdjust:"font-size-adjust",fontStretch:"font-stretch",fontStyle:"font-style",fontVariant:"font-variant",fontWeight:"font-weight",glyphName:"glyph-name",glyphOrientationHorizontal:"glyph-orientation-horizontal",glyphOrientationVertical:"glyph-orientation-vertical",hrefLang:"hreflang",horizAdvX:"horiz-adv-x",horizOriginX:"horiz-origin-x",horizOriginY:"horiz-origin-y",imageRendering:"image-rendering",letterSpacing:"letter-spacing",lightingColor:"lighting-color",markerEnd:"marker-end",markerMid:"marker-mid",markerStart:"marker-start",maskType:"mask-type",navDown:"nav-down",navDownLeft:"nav-down-left",navDownRight:"nav-down-right",navLeft:"nav-left",navNext:"nav-next",navPrev:"nav-prev",navRight:"nav-right",navUp:"nav-up",navUpLeft:"nav-up-left",navUpRight:"nav-up-right",onAbort:"onabort",onActivate:"onactivate",onAfterPrint:"onafterprint",onBeforePrint:"onbeforeprint",onBegin:"onbegin",onCancel:"oncancel",onCanPlay:"oncanplay",onCanPlayThrough:"oncanplaythrough",onChange:"onchange",onClick:"onclick",onClose:"onclose",onCopy:"oncopy",onCueChange:"oncuechange",onCut:"oncut",onDblClick:"ondblclick",onDrag:"ondrag",onDragEnd:"ondragend",onDragEnter:"ondragenter",onDragExit:"ondragexit",onDragLeave:"ondragleave",onDragOver:"ondragover",onDragStart:"ondragstart",onDrop:"ondrop",onDurationChange:"ondurationchange",onEmptied:"onemptied",onEnd:"onend",onEnded:"onended",onError:"onerror",onFocus:"onfocus",onFocusIn:"onfocusin",onFocusOut:"onfocusout",onHashChange:"onhashchange",onInput:"oninput",onInvalid:"oninvalid",onKeyDown:"onkeydown",onKeyPress:"onkeypress",onKeyUp:"onkeyup",onLoad:"onload",onLoadedData:"onloadeddata",onLoadedMetadata:"onloadedmetadata",onLoadStart:"onloadstart",onMessage:"onmessage",onMouseDown:"onmousedown",onMouseEnter:"onmouseenter",onMouseLeave:"onmouseleave",onMouseMove:"onmousemove",onMouseOut:"onmouseout",onMouseOver:"onmouseover",onMouseUp:"onmouseup",onMouseWheel:"onmousewheel",onOffline:"onoffline",onOnline:"ononline",onPageHide:"onpagehide",onPageShow:"onpageshow",onPaste:"onpaste",onPause:"onpause",onPlay:"onplay",onPlaying:"onplaying",onPopState:"onpopstate",onProgress:"onprogress",onRateChange:"onratechange",onRepeat:"onrepeat",onReset:"onreset",onResize:"onresize",onScroll:"onscroll",onSeeked:"onseeked",onSeeking:"onseeking",onSelect:"onselect",onShow:"onshow",onStalled:"onstalled",onStorage:"onstorage",onSubmit:"onsubmit",onSuspend:"onsuspend",onTimeUpdate:"ontimeupdate",onToggle:"ontoggle",onUnload:"onunload",onVolumeChange:"onvolumechange",onWaiting:"onwaiting",onZoom:"onzoom",overlinePosition:"overline-position",overlineThickness:"overline-thickness",paintOrder:"paint-order",panose1:"panose-1",pointerEvents:"pointer-events",referrerPolicy:"referrerpolicy",renderingIntent:"rendering-intent",shapeRendering:"shape-rendering",stopColor:"stop-color",stopOpacity:"stop-opacity",strikethroughPosition:"strikethrough-position",strikethroughThickness:"strikethrough-thickness",strokeDashArray:"stroke-dasharray",strokeDashOffset:"stroke-dashoffset",strokeLineCap:"stroke-linecap",strokeLineJoin:"stroke-linejoin",strokeMiterLimit:"stroke-miterlimit",strokeOpacity:"stroke-opacity",strokeWidth:"stroke-width",tabIndex:"tabindex",textAnchor:"text-anchor",textDecoration:"text-decoration",textRendering:"text-rendering",transformOrigin:"transform-origin",typeOf:"typeof",underlinePosition:"underline-position",underlineThickness:"underline-thickness",unicodeBidi:"unicode-bidi",unicodeRange:"unicode-range",unitsPerEm:"units-per-em",vAlphabetic:"v-alphabetic",vHanging:"v-hanging",vIdeographic:"v-ideographic",vMathematical:"v-mathematical",vectorEffect:"vector-effect",vertAdvY:"vert-adv-y",vertOriginX:"vert-origin-x",vertOriginY:"vert-origin-y",wordSpacing:"word-spacing",writingMode:"writing-mode",xHeight:"x-height",playbackOrder:"playbackorder",timelineBegin:"timelinebegin"},properties:{about:Ot,accentHeight:R,accumulate:null,additive:null,alignmentBaseline:null,alphabetic:R,amplitude:R,arabicForm:null,ascent:R,attributeName:null,attributeType:null,azimuth:R,bandwidth:null,baselineShift:null,baseFrequency:null,baseProfile:null,bbox:null,begin:null,bias:R,by:null,calcMode:null,capHeight:R,className:Le,clip:null,clipPath:null,clipPathUnits:null,clipRule:null,color:null,colorInterpolation:null,colorInterpolationFilters:null,colorProfile:null,colorRendering:null,content:null,contentScriptType:null,contentStyleType:null,crossOrigin:null,cursor:null,cx:null,cy:null,d:null,dataType:null,defaultAction:null,descent:R,diffuseConstant:R,direction:null,display:null,dur:null,divisor:R,dominantBaseline:null,download:ee,dx:null,dy:null,edgeMode:null,editable:null,elevation:R,enableBackground:null,end:null,event:null,exponent:R,externalResourcesRequired:null,fill:null,fillOpacity:R,fillRule:null,filter:null,filterRes:null,filterUnits:null,floodColor:null,floodOpacity:null,focusable:null,focusHighlight:null,fontFamily:null,fontSize:null,fontSizeAdjust:null,fontStretch:null,fontStyle:null,fontVariant:null,fontWeight:null,format:null,fr:null,from:null,fx:null,fy:null,g1:yn,g2:yn,glyphName:yn,glyphOrientationHorizontal:null,glyphOrientationVertical:null,glyphRef:null,gradientTransform:null,gradientUnits:null,handler:null,hanging:R,hatchContentUnits:null,hatchUnits:null,height:null,href:null,hrefLang:null,horizAdvX:R,horizOriginX:R,horizOriginY:R,id:null,ideographic:R,imageRendering:null,initialVisibility:null,in:null,in2:null,intercept:R,k:R,k1:R,k2:R,k3:R,k4:R,kernelMatrix:Ot,kernelUnitLength:null,keyPoints:null,keySplines:null,keyTimes:null,kerning:null,lang:null,lengthAdjust:null,letterSpacing:null,lightingColor:null,limitingConeAngle:R,local:null,markerEnd:null,markerMid:null,markerStart:null,markerHeight:null,markerUnits:null,markerWidth:null,mask:null,maskContentUnits:null,maskType:null,maskUnits:null,mathematical:null,max:null,media:null,mediaCharacterEncoding:null,mediaContentEncodings:null,mediaSize:R,mediaTime:null,method:null,min:null,mode:null,name:null,navDown:null,navDownLeft:null,navDownRight:null,navLeft:null,navNext:null,navPrev:null,navRight:null,navUp:null,navUpLeft:null,navUpRight:null,numOctaves:null,observer:null,offset:null,onAbort:null,onActivate:null,onAfterPrint:null,onBeforePrint:null,onBegin:null,onCancel:null,onCanPlay:null,onCanPlayThrough:null,onChange:null,onClick:null,onClose:null,onCopy:null,onCueChange:null,onCut:null,onDblClick:null,onDrag:null,onDragEnd:null,onDragEnter:null,onDragExit:null,onDragLeave:null,onDragOver:null,onDragStart:null,onDrop:null,onDurationChange:null,onEmptied:null,onEnd:null,onEnded:null,onError:null,onFocus:null,onFocusIn:null,onFocusOut:null,onHashChange:null,onInput:null,onInvalid:null,onKeyDown:null,onKeyPress:null,onKeyUp:null,onLoad:null,onLoadedData:null,onLoadedMetadata:null,onLoadStart:null,onMessage:null,onMouseDown:null,onMouseEnter:null,onMouseLeave:null,onMouseMove:null,onMouseOut:null,onMouseOver:null,onMouseUp:null,onMouseWheel:null,onOffline:null,onOnline:null,onPageHide:null,onPageShow:null,onPaste:null,onPause:null,onPlay:null,onPlaying:null,onPopState:null,onProgress:null,onRateChange:null,onRepeat:null,onReset:null,onResize:null,onScroll:null,onSeeked:null,onSeeking:null,onSelect:null,onShow:null,onStalled:null,onStorage:null,onSubmit:null,onSuspend:null,onTimeUpdate:null,onToggle:null,onUnload:null,onVolumeChange:null,onWaiting:null,onZoom:null,opacity:null,operator:null,order:null,orient:null,orientation:null,origin:null,overflow:null,overlay:null,overlinePosition:R,overlineThickness:R,paintOrder:null,panose1:null,path:null,pathLength:R,patternContentUnits:null,patternTransform:null,patternUnits:null,phase:null,ping:Le,pitch:null,playbackOrder:null,pointerEvents:null,points:null,pointsAtX:R,pointsAtY:R,pointsAtZ:R,preserveAlpha:null,preserveAspectRatio:null,primitiveUnits:null,propagate:null,property:Ot,r:null,radius:null,referrerPolicy:null,refX:null,refY:null,rel:Ot,rev:Ot,renderingIntent:null,repeatCount:null,repeatDur:null,requiredExtensions:Ot,requiredFeatures:Ot,requiredFonts:Ot,requiredFormats:Ot,resource:null,restart:null,result:null,rotate:null,rx:null,ry:null,scale:null,seed:null,shapeRendering:null,side:null,slope:null,snapshotTime:null,specularConstant:R,specularExponent:R,spreadMethod:null,spacing:null,startOffset:null,stdDeviation:null,stemh:null,stemv:null,stitchTiles:null,stopColor:null,stopOpacity:null,strikethroughPosition:R,strikethroughThickness:R,string:null,stroke:null,strokeDashArray:Ot,strokeDashOffset:null,strokeLineCap:null,strokeLineJoin:null,strokeMiterLimit:R,strokeOpacity:R,strokeWidth:null,style:null,surfaceScale:R,syncBehavior:null,syncBehaviorDefault:null,syncMaster:null,syncTolerance:null,syncToleranceDefault:null,systemLanguage:Ot,tabIndex:R,tableValues:null,target:null,targetX:R,targetY:R,textAnchor:null,textDecoration:null,textRendering:null,textLength:null,timelineBegin:null,title:null,transformBehavior:null,type:null,typeOf:Ot,to:null,transform:null,transformOrigin:null,u1:null,u2:null,underlinePosition:R,underlineThickness:R,unicode:null,unicodeBidi:null,unicodeRange:null,unitsPerEm:R,values:null,vAlphabetic:R,vMathematical:R,vectorEffect:null,vHanging:R,vIdeographic:R,version:null,vertAdvY:R,vertOriginX:R,vertOriginY:R,viewBox:null,viewTarget:null,visibility:null,width:null,widths:null,wordSpacing:null,writingMode:null,x:null,x1:null,x2:null,xChannelSelector:null,xHeight:R,y:null,y1:null,y2:null,yChannelSelector:null,z:null,zoomAndPan:null},space:"svg",transform:Ks});var Hp=ha({properties:{xLinkActuate:null,xLinkArcRole:null,xLinkHref:null,xLinkRole:null,xLinkShow:null,xLinkTitle:null,xLinkType:null},space:"xlink",transform(e,t){return"xlink:"+t.slice(5).toLowerCase()}});var _p=ha({attributes:{xmlnsxlink:"xmlns:xlink"},properties:{xmlnsXLink:null,xmlns:null},space:"xmlns",transform:Zs});var Gp=ha({properties:{xmlBase:null,xmlLang:null,xmlSpace:null},space:"xml",transform(e,t){return"xml:"+t.slice(3).toLowerCase()}});var Vp={classId:"classID",dataType:"datatype",itemId:"itemID",strokeDashArray:"strokeDasharray",strokeDashOffset:"strokeDashoffset",strokeLineCap:"strokeLinecap",strokeLineJoin:"strokeLinejoin",strokeMiterLimit:"strokeMiterlimit",typeOf:"typeof",xLinkActuate:"xlinkActuate",xLinkArcRole:"xlinkArcrole",xLinkHref:"xlinkHref",xLinkRole:"xlinkRole",xLinkShow:"xlinkShow",xLinkTitle:"xlinkTitle",xLinkType:"xlinkType",xmlnsXLink:"xmlnsXlink"};var iI=/[A-Z]/g,RL=/-[a-z]/g,uI=/^data[-\w.:]+$/i;function jp(e,t){let a=ji(t),n=t,l=lt;if(a in e.normal)return e.property[e.normal[a]];if(a.length>4&&a.slice(0,4)==="data"&&uI.test(t)){if(t.charAt(4)==="-"){let r=t.slice(5).replace(RL,cI);n="data"+r.charAt(0).toUpperCase()+r.slice(1)}else{let r=t.slice(4);if(!RL.test(r)){let o=r.replace(iI,sI);o.charAt(0)!=="-"&&(o="-"+o),t="data"+o}}l=Xl}return new l(n,t)}function sI(e){return"-"+e.toLowerCase()}function cI(e){return e.charAt(1).toUpperCase()}var OL=Up([Fp,zL,Hp,_p,Gp],"html"),Js=Up([Fp,BL,Hp,_p,Gp],"svg");function NL(e){return e.join(" ").trim()}var JL=J(QL(),1);var $s=YL("end"),ro=YL("start");function YL(e){return t;function t(a){let n=a&&a.position&&a.position[e]||{};if(typeof n.line=="number"&&n.line>0&&typeof n.column=="number"&&n.column>0)return{line:n.line,column:n.column,offset:typeof n.offset=="number"&&n.offset>-1?n.offset:void 0}}}function Yp(e){let t=ro(e),a=$s(e);if(t&&a)return{start:t,end:a}}function rl(e){return!e||typeof e!="object"?"":"position"in e||"type"in e?KL(e.position):"start"in e||"end"in e?KL(e):"line"in e||"column"in e?Kp(e):""}function Kp(e){return ZL(e&&e.line)+":"+ZL(e&&e.column)}function KL(e){return Kp(e&&e.start)+"-"+Kp(e&&e.end)}function ZL(e){return e&&typeof e=="number"?e:1}var Ve=class extends Error{constructor(t,a,n){super(),typeof a=="string"&&(n=a,a=void 0);let l="",r={},o=!1;if(a&&("line"in a&&"column"in a?r={place:a}:"start"in a&&"end"in a?r={place:a}:"type"in a?r={ancestors:[a],place:a.position}:r={...a}),typeof t=="string"?l=t:!r.cause&&t&&(o=!0,l=t.message,r.cause=t),!r.ruleId&&!r.source&&typeof n=="string"){let u=n.indexOf(":");u===-1?r.ruleId=n:(r.source=n.slice(0,u),r.ruleId=n.slice(u+1))}if(!r.place&&r.ancestors&&r.ancestors){let u=r.ancestors[r.ancestors.length-1];u&&(r.place=u.position)}let i=r.place&&"start"in r.place?r.place.start:r.place;this.ancestors=r.ancestors||void 0,this.cause=r.cause||void 0,this.column=i?i.column:void 0,this.fatal=void 0,this.file="",this.message=l,this.line=i?i.line:void 0,this.name=rl(r.place)||"1:1",this.place=r.place||void 0,this.reason=this.message,this.ruleId=r.ruleId||void 0,this.source=r.source||void 0,this.stack=o&&r.cause&&typeof r.cause.stack=="string"?r.cause.stack:"",this.actual=void 0,this.expected=void 0,this.note=void 0,this.url=void 0}};Ve.prototype.file="";Ve.prototype.name="";Ve.prototype.reason="";Ve.prototype.message="";Ve.prototype.stack="";Ve.prototype.column=void 0;Ve.prototype.line=void 0;Ve.prototype.ancestors=void 0;Ve.prototype.cause=void 0;Ve.prototype.fatal=void 0;Ve.prototype.place=void 0;Ve.prototype.ruleId=void 0;Ve.prototype.source=void 0;var Zp={}.hasOwnProperty,NI=new Map,qI=/[A-Z]/g,UI=new Set(["table","tbody","thead","tfoot","tr"]),PI=new Set(["td","th"]),WL="https://github.com/syntax-tree/hast-util-to-jsx-runtime";function Jp(e,t){if(!t||t.Fragment===void 0)throw new TypeError("Expected `Fragment` in options");let a=t.filePath||void 0,n;if(t.development){if(typeof t.jsxDEV!="function")throw new TypeError("Expected `jsxDEV` in options when `development: true`");n=QI(a,t.jsxDEV)}else{if(typeof t.jsx!="function")throw new TypeError("Expected `jsx` in production options");if(typeof t.jsxs!="function")throw new TypeError("Expected `jsxs` in production options");n=XI(a,t.jsx,t.jsxs)}let l={Fragment:t.Fragment,ancestors:[],components:t.components||{},create:n,elementAttributeNameCase:t.elementAttributeNameCase||"react",evaluater:t.createEvaluater?t.createEvaluater():void 0,filePath:a,ignoreInvalidStyle:t.ignoreInvalidStyle||!1,passKeys:t.passKeys!==!1,passNode:t.passNode||!1,schema:t.space==="svg"?Js:OL,stylePropertyNameCase:t.stylePropertyNameCase||"dom",tableCellAlignToStyle:t.tableCellAlignToStyle!==!1},r=$L(l,e,void 0);return r&&typeof r!="string"?r:l.create(e,l.Fragment,{children:r||void 0},void 0)}function $L(e,t,a){if(t.type==="element")return FI(e,t,a);if(t.type==="mdxFlowExpression"||t.type==="mdxTextExpression")return HI(e,t);if(t.type==="mdxJsxFlowElement"||t.type==="mdxJsxTextElement")return GI(e,t,a);if(t.type==="mdxjsEsm")return _I(e,t);if(t.type==="root")return VI(e,t,a);if(t.type==="text")return jI(e,t)}function FI(e,t,a){let n=e.schema,l=n;t.tagName.toLowerCase()==="svg"&&n.space==="html"&&(l=Js,e.schema=l),e.ancestors.push(t);let r=tb(e,t.tagName,!1),o=YI(e,t),i=$p(e,t);return UI.has(t.tagName)&&(i=i.filter(function(u){return typeof u=="string"?!qp(u):!0})),eb(e,o,r,t),Wp(o,i),e.ancestors.pop(),e.schema=n,e.create(t,r,o,a)}function HI(e,t){if(t.data&&t.data.estree&&e.evaluater){let n=t.data.estree.body[0];return n.type,e.evaluater.evaluateExpression(n.expression)}Yi(e,t.position)}function _I(e,t){if(t.data&&t.data.estree&&e.evaluater)return e.evaluater.evaluateProgram(t.data.estree);Yi(e,t.position)}function GI(e,t,a){let n=e.schema,l=n;t.name==="svg"&&n.space==="html"&&(l=Js,e.schema=l),e.ancestors.push(t);let r=t.name===null?e.Fragment:tb(e,t.name,!0),o=KI(e,t),i=$p(e,t);return eb(e,o,r,t),Wp(o,i),e.ancestors.pop(),e.schema=n,e.create(t,r,o,a)}function VI(e,t,a){let n={};return Wp(n,$p(e,t)),e.create(t,e.Fragment,n,a)}function jI(e,t){return t.value}function eb(e,t,a,n){typeof a!="string"&&a!==e.Fragment&&e.passNode&&(t.node=n)}function Wp(e,t){if(t.length>0){let a=t.length>1?t:t[0];a&&(e.children=a)}}function XI(e,t,a){return n;function n(l,r,o,i){let c=Array.isArray(o.children)?a:t;return i?c(r,o,i):c(r,o)}}function QI(e,t){return a;function a(n,l,r,o){let i=Array.isArray(r.children),u=ro(n);return t(l,r,o,i,{columnNumber:u?u.column-1:void 0,fileName:e,lineNumber:u?u.line:void 0},void 0)}}function YI(e,t){let a={},n,l;for(l in t.properties)if(l!=="children"&&Zp.call(t.properties,l)){let r=ZI(e,l,t.properties[l]);if(r){let[o,i]=r;e.tableCellAlignToStyle&&o==="align"&&typeof i=="string"&&PI.has(t.tagName)?n=i:a[o]=i}}if(n){let r=a.style||(a.style={});r[e.stylePropertyNameCase==="css"?"text-align":"textAlign"]=n}return a}function KI(e,t){let a={};for(let n of t.attributes)if(n.type==="mdxJsxExpressionAttribute")if(n.data&&n.data.estree&&e.evaluater){let r=n.data.estree.body[0];r.type;let o=r.expression;o.type;let i=o.properties[0];i.type,Object.assign(a,e.evaluater.evaluateExpression(i.argument))}else Yi(e,t.position);else{let l=n.name,r;if(n.value&&typeof n.value=="object")if(n.value.data&&n.value.data.estree&&e.evaluater){let i=n.value.data.estree.body[0];i.type,r=e.evaluater.evaluateExpression(i.expression)}else Yi(e,t.position);else r=n.value===null?!0:n.value;a[l]=r}return a}function $p(e,t){let a=[],n=-1,l=e.passKeys?new Map:NI;for(;++n<t.children.length;){let r=t.children[n],o;if(e.passKeys){let u=r.type==="element"?r.tagName:r.type==="mdxJsxFlowElement"||r.type==="mdxJsxTextElement"?r.name:void 0;if(u){let c=l.get(u)||0;o=u+"-"+c,l.set(u,c+1)}}let i=$L(e,r,o);i!==void 0&&a.push(i)}return a}function ZI(e,t,a){let n=jp(e.schema,t);if(!(a==null||typeof a=="number"&&Number.isNaN(a))){if(Array.isArray(a)&&(a=n.commaSeparated?DL(a):NL(a)),n.property==="style"){let l=typeof a=="object"?a:JI(e,String(a));return e.stylePropertyNameCase==="css"&&(l=WI(l)),["style",l]}return[e.elementAttributeNameCase==="react"&&n.space?Vp[n.property]||n.property:n.attribute,a]}}function JI(e,t){try{return(0,JL.default)(t,{reactCompat:!0})}catch(a){if(e.ignoreInvalidStyle)return{};let n=a,l=new Ve("Cannot parse `style` attribute",{ancestors:e.ancestors,cause:n,ruleId:"style",source:"hast-util-to-jsx-runtime"});throw l.file=e.filePath||void 0,l.url=WL+"#cannot-parse-style-attribute",l}}function tb(e,t,a){let n;if(!a)n={type:"Literal",value:t};else if(t.includes(".")){let l=t.split("."),r=-1,o;for(;++r<l.length;){let i=Qs(l[r])?{type:"Identifier",name:l[r]}:{type:"Literal",value:l[r]};o=o?{type:"MemberExpression",object:o,property:i,computed:!!(r&&i.type==="Literal"),optional:!1}:i}n=o}else n=Qs(t)&&!/^[a-z]/.test(t)?{type:"Identifier",name:t}:{type:"Literal",value:t};if(n.type==="Literal"){let l=n.value;return Zp.call(e.components,l)?e.components[l]:l}if(e.evaluater)return e.evaluater.evaluateExpression(n);Yi(e)}function Yi(e,t){let a=new Ve("Cannot handle MDX estrees without `createEvaluater`",{ancestors:e.ancestors,place:t,ruleId:"mdx-estree",source:"hast-util-to-jsx-runtime"});throw a.file=e.filePath||void 0,a.url=WL+"#cannot-handle-mdx-estrees-without-createevaluater",a}function WI(e){let t={},a;for(a in e)Zp.call(e,a)&&(t[$I(a)]=e[a]);return t}function $I(e){let t=e.replace(qI,e2);return t.slice(0,3)==="ms-"&&(t="-"+t),t}function e2(e){return"-"+e.toLowerCase()}var Ki={action:["form"],cite:["blockquote","del","ins","q"],data:["object"],formAction:["button","input"],href:["a","area","base","link"],icon:["menuitem"],itemId:null,manifest:["html"],ping:["a","area"],poster:["video"],src:["audio","embed","iframe","img","input","script","source","track","video"]};var co=J(ye(),1),Tv=J(je(),1);var t2={};function Yl(e,t){let a=t||t2,n=typeof a.includeImageAlt=="boolean"?a.includeImageAlt:!0,l=typeof a.includeHtml=="boolean"?a.includeHtml:!0;return nb(e,n,l)}function nb(e,t,a){if(a2(e)){if("value"in e)return e.type==="html"&&!a?"":e.value;if(t&&"alt"in e&&e.alt)return e.alt;if("children"in e)return ab(e.children,t,a)}return Array.isArray(e)?ab(e,t,a):""}function ab(e,t,a){let n=[],l=-1;for(;++l<e.length;)n[l]=nb(e[l],t,a);return n.join("")}function a2(e){return!!(e&&typeof e=="object")}var lb=document.createElement("i");function oo(e){let t="&"+e+";";lb.innerHTML=t;let a=lb.textContent;return a.charCodeAt(a.length-1)===59&&e!=="semi"||a===t?!1:a}function rt(e,t,a,n){let l=e.length,r=0,o;if(t<0?t=-t>l?0:l+t:t=t>l?l:t,a=a>0?a:0,n.length<1e4)o=Array.from(n),o.unshift(t,a),e.splice(...o);else for(a&&e.splice(t,a);r<n.length;)o=n.slice(r,r+1e4),o.unshift(t,0),e.splice(...o),r+=1e4,t+=1e4}function kt(e,t){return e.length>0?(rt(e,e.length,0,t),e):t}var rb={}.hasOwnProperty;function ec(e){let t={},a=-1;for(;++a<e.length;)n2(t,e[a]);return t}function n2(e,t){let a;for(a in t){let l=(rb.call(e,a)?e[a]:void 0)||(e[a]={}),r=t[a],o;if(r)for(o in r){rb.call(l,o)||(l[o]=[]);let i=r[o];l2(l[o],Array.isArray(i)?i:i?[i]:[])}}}function l2(e,t){let a=-1,n=[];for(;++a<t.length;)(t[a].add==="after"?e:n).push(t[a]);rt(e,0,0,n)}function tc(e,t){let a=Number.parseInt(e,t);return a<9||a===11||a>13&&a<32||a>126&&a<160||a>55295&&a<57344||a>64975&&a<65008||(a&65535)===65535||(a&65535)===65534||a>1114111?"\uFFFD":String.fromCodePoint(a)}function gt(e){return e.replace(/[\t\n\r ]+/g," ").replace(/^ | $/g,"").toLowerCase().toUpperCase()}var $e=ol(/[A-Za-z]/),Pe=ol(/[\dA-Za-z]/),ob=ol(/[#-'*+\--9=?A-Z^-~]/);function Kl(e){return e!==null&&(e<32||e===127)}var Zi=ol(/\d/),ib=ol(/[\dA-Fa-f]/),ub=ol(/[!-/:-@[-`{-~]/);function F(e){return e!==null&&e<-2}function ie(e){return e!==null&&(e<0||e===32)}function Q(e){return e===-2||e===-1||e===32}var Zl=ol(/\p{P}|\p{S}/u),Ua=ol(/\s/);function ol(e){return t;function t(a){return a!==null&&a>-1&&e.test(String.fromCharCode(a))}}function ga(e){let t=[],a=-1,n=0,l=0;for(;++a<e.length;){let r=e.charCodeAt(a),o="";if(r===37&&Pe(e.charCodeAt(a+1))&&Pe(e.charCodeAt(a+2)))l=2;else if(r<128)/[!#$&-;=?-Z_a-z~]/.test(String.fromCharCode(r))||(o=String.fromCharCode(r));else if(r>55295&&r<57344){let i=e.charCodeAt(a+1);r<56320&&i>56319&&i<57344?(o=String.fromCharCode(r,i),l=1):o="\uFFFD"}else o=String.fromCharCode(r);o&&(t.push(e.slice(n,a),encodeURIComponent(o)),n=a+l+1,o=""),l&&(a+=l,l=0)}return t.join("")+e.slice(n)}function Z(e,t,a,n){let l=n?n-1:1/0,r=0;return o;function o(u){return Q(u)?(e.enter(a),i(u)):t(u)}function i(u){return Q(u)&&r++<l?(e.consume(u),i):(e.exit(a),t(u))}}function em(e,t,a,n,l,r){let o=0;return i;function i(s){return r>0&&Q(s)?(e.enter(n),u(s)):c(s)}function u(s){return Q(s)&&o<r?(e.consume(s),o++,u):(e.exit(n),c(s))}function c(s){return o>=l?t(s):a(s)}}var sb={tokenize:r2};function r2(e){let t=e.attempt(this.parser.constructs.contentInitial,n,l),a;return t;function n(i){if(i===null){e.consume(i);return}return e.enter("lineEnding"),e.consume(i),e.exit("lineEnding"),Z(e,t,"linePrefix")}function l(i){return e.enter("paragraph"),r(i)}function r(i){let u=e.enter("chunkText",{contentType:"text",previous:a});return a&&(a.next=u),a=u,o(i)}function o(i){if(i===null){e.exit("chunkText"),e.exit("paragraph"),e.consume(i);return}return F(i)?(e.consume(i),e.exit("chunkText"),r):(e.consume(i),o)}}var Ln=class{constructor(){this.index=new Map,this.map=[]}add(t,a,n){cb(this,t,a,n,!1)}addBefore(t,a,n){cb(this,t,a,n,!0)}consume(t){if(this.map.sort(function(r,o){return r[0]-o[0]}),this.map.length===0)return;let a=this.map.length,n=[];for(;a>0;)a-=1,n.push(t.slice(this.map[a][0]+this.map[a][1]),this.map[a][2]),t.length=this.map[a][0];n.push(t.slice()),t.length=0;let l=n.pop();for(;l;){for(let r of l)t.push(r);l=n.pop()}this.map.length=0,this.index.clear()}};function cb(e,t,a,n,l){if(a===0&&n.length===0)return;let r=e.index.get(t);if(r){r[1]+=a,l?(n.push(...r[2]),r[2]=n):r[2].push(...n);return}let o=[t,a,n];e.map.push(o),e.index.set(t,o)}var db={tokenize:o2},fb={tokenize:i2};function o2(e){let t=this,a=[],n=0,l,r,o;return i;function i(h){if(n<a.length){let L=a[n];return t.containerState=L[1],e.attempt(L[0].continuation,u,c)(h)}return c(h)}function u(h){if(n++,t.containerState._closeFlow){t.containerState._closeFlow=void 0,l&&m();let L=t.events.length,I=L,C;for(;I--;)if(t.events[I][0]==="exit"&&t.events[I][1].type==="chunkFlow"){C=t.events[I][1].end;break}x(n);let T=L;for(;T<t.events.length;)t.events[T][1].end={...C},T++;let N=new Ln;return N.add(I+1,0,t.events.slice(L)),N.add(L,T-L,[]),N.consume(t.events),c(h)}return i(h)}function c(h){if(n===a.length){if(!l)return d(h);if(l.currentConstruct&&l.currentConstruct.concrete)return g(h);t.interrupt=!!(l.currentConstruct&&!l._gfmTableDynamicInterruptHack)}return t.containerState={},e.check(fb,s,f)(h)}function s(h){return l&&m(),x(n),d(h)}function f(h){return t.parser.lazy[t.now().line]=n!==a.length,o=t.now().offset,g(h)}function d(h){return t.containerState={},e.attempt(fb,p,g)(h)}function p(h){return n++,a.push([t.currentConstruct,t.containerState]),d(h)}function g(h){if(h===null){l&&m(),x(0),e.consume(h);return}return l=l||t.parser.flow(t.now()),e.enter("chunkFlow",{_tokenizer:l,contentType:"flow",previous:r}),y(h)}function y(h){if(h===null){w(e.exit("chunkFlow"),!0),x(0),e.consume(h);return}return F(h)?(e.consume(h),w(e.exit("chunkFlow")),n=0,t.interrupt=void 0,i):(e.consume(h),y)}function w(h,L){let I=t.sliceStream(h);if(L&&I.push(null),h.previous=r,r&&(r.next=h),r=h,l.defineSkip(h.start),l.write(I),t.parser.lazy[h.start.line]){let C=l.events.length;for(;C--;)if(l.events[C][1].start.offset<o&&(!l.events[C][1].end||l.events[C][1].end.offset>o))return;let T=t.events.length,N=T,P,k;for(;N--;)if(t.events[N][0]==="exit"&&t.events[N][1].type==="chunkFlow"){if(P){k=t.events[N][1].end;break}P=!0}for(x(n),C=T;C<t.events.length;)t.events[C][1].end={...k},C++;let oe=new Ln;oe.add(N+1,0,t.events.slice(T)),oe.add(T,C-T,[]),oe.consume(t.events)}}function x(h){let L=a.length;for(;L-- >h;){let I=a[L];t.containerState=I[1],I[0].exit.call(t,e)}a.length=h}function m(){l.write([null]),r=void 0,l=void 0,t.containerState._closeFlow=void 0}}function i2(e,t,a){return Z(e,e.attempt(this.parser.constructs.document,t,a),"linePrefix",this.parser.constructs.disable.null.includes("codeIndented")?void 0:4)}function io(e){if(e===null||ie(e)||Ua(e))return 1;if(Zl(e))return 2}function il(e,t,a){let n=[],l=-1;for(;++l<e.length;){let r=e[l].resolveAll;r&&!n.includes(r)&&(t=r(t,a),n.push(r))}return t}var Ji={name:"attention",resolveAll:u2,tokenize:s2};function u2(e,t){let a=-1,n;for(;++a<e.length;)if(e[a][0]==="enter"&&e[a][1].type==="attentionSequence"&&e[a][1]._close){let l=a;for(;l--;)if(e[l][0]==="exit"&&e[l][1].type==="attentionSequence"&&e[l][1]._open&&t.sliceSerialize(e[l][1]).charCodeAt(0)===t.sliceSerialize(e[a][1]).charCodeAt(0)){if((e[l][1]._close||e[a][1]._open)&&(e[a][1].end.offset-e[a][1].start.offset)%3&&!((e[l][1].end.offset-e[l][1].start.offset+e[a][1].end.offset-e[a][1].start.offset)%3))continue;let r=e[l][1].end.offset-e[l][1].start.offset>1&&e[a][1].end.offset-e[a][1].start.offset>1?2:1,o={...e[l][1].end},i={...e[a][1].start};pb(o,-r),pb(i,r);let u={type:r>1?"strongSequence":"emphasisSequence",start:o,end:{...e[l][1].end}},c={type:r>1?"strongSequence":"emphasisSequence",start:{...e[a][1].start},end:i},s={type:r>1?"strongText":"emphasisText",start:{...e[l][1].end},end:{...e[a][1].start}},f={type:r>1?"strong":"emphasis",start:{...u.start},end:{...c.end}};e[l][1].end={...u.start},e[a][1].start={...c.end},n=[],e[l][1].end.offset-e[l][1].start.offset&&(n=kt(n,[["enter",e[l][1],t],["exit",e[l][1],t]])),n=kt(n,[["enter",f,t],["enter",u,t],["exit",u,t],["enter",s,t]]),n=kt(n,il(t.parser.constructs.insideSpan.null,e.slice(l+1,a),t)),n=kt(n,[["exit",s,t],["enter",c,t],["exit",c,t],["exit",f,t]]);let d=0;e[a][1].end.offset-e[a][1].start.offset&&(d=2,n=kt(n,[["enter",e[a][1],t],["exit",e[a][1],t]])),rt(e,l-1,a-l+3,n),a=l+n.length-d-2;break}}for(a=-1;++a<e.length;)e[a][1].type==="attentionSequence"&&(e[a][1].type="data");return e}function s2(e,t){let a=this.parser.constructs.attentionMarkers.null,n=this.previous,l=io(n),r;return o;function o(u){return r=u,e.enter("attentionSequence"),i(u)}function i(u){if(u===r)return e.consume(u),i;let c=e.exit("attentionSequence"),s=io(u),f=!s||s===2&&l||a.includes(u)&&u!==42&&u!==95,d=!l||l===2&&s||a.includes(n)&&n!==42&&n!==95;return c._open=!!(r===42?f:f&&(l||!d)),c._close=!!(r===42?d:d&&(s||!f)),t(u)}}function pb(e,t){e.column+=t,e.offset+=t,e._bufferIndex+=t}var tm={name:"autolink",tokenize:c2};function c2(e,t,a){let n=0;return l;function l(p){return e.enter("autolink"),e.enter("autolinkMarker"),e.consume(p),e.exit("autolinkMarker"),e.enter("autolinkProtocol"),r}function r(p){return $e(p)?(e.consume(p),o):p===64?a(p):c(p)}function o(p){return p===43||p===45||p===46||Pe(p)?(n=1,i(p)):c(p)}function i(p){return p===58?(e.consume(p),n=0,u):(p===43||p===45||p===46||Pe(p))&&n++<32?(e.consume(p),i):(n=0,c(p))}function u(p){return p===62?(e.exit("autolinkProtocol"),e.enter("autolinkMarker"),e.consume(p),e.exit("autolinkMarker"),e.exit("autolink"),t):p===null||p===32||p===60||Kl(p)?a(p):(e.consume(p),u)}function c(p){return p===64?(e.consume(p),s):ob(p)?(e.consume(p),c):a(p)}function s(p){return Pe(p)?f(p):a(p)}function f(p){return p===46?(e.consume(p),n=0,s):p===62?(e.exit("autolinkProtocol").type="autolinkEmail",e.enter("autolinkMarker"),e.consume(p),e.exit("autolinkMarker"),e.exit("autolink"),t):d(p)}function d(p){if((p===45||Pe(p))&&n++<63){let g=p===45?d:f;return e.consume(p),g}return a(p)}}var Pa={partial:!0,tokenize:f2};function f2(e,t,a){return n;function n(r){return Q(r)?Z(e,l,"linePrefix")(r):l(r)}function l(r){return r===null||F(r)?t(r):a(r)}}var ac={continuation:{tokenize:p2},exit:m2,name:"blockQuote",tokenize:d2};function d2(e,t,a){let n=this;return l;function l(o){if(o===62){let i=n.containerState;return i.open||(e.enter("blockQuote",{_container:!0}),i.open=!0),e.enter("blockQuotePrefix"),e.enter("blockQuoteMarker"),e.consume(o),e.exit("blockQuoteMarker"),r}return a(o)}function r(o){return Q(o)?(e.enter("blockQuotePrefixWhitespace"),e.consume(o),e.exit("blockQuotePrefixWhitespace"),e.exit("blockQuotePrefix"),t):(e.exit("blockQuotePrefix"),t(o))}}function p2(e,t,a){let n=this;return l;function l(o){return Q(o)?Z(e,r,"linePrefix",n.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(o):r(o)}function r(o){return e.attempt(ac,t,a)(o)}}function m2(e){e.exit("blockQuote")}var nc={name:"characterEscape",tokenize:h2};function h2(e,t,a){return n;function n(r){return e.enter("characterEscape"),e.enter("escapeMarker"),e.consume(r),e.exit("escapeMarker"),l}function l(r){return ub(r)?(e.enter("characterEscapeValue"),e.consume(r),e.exit("characterEscapeValue"),e.exit("characterEscape"),t):a(r)}}var lc={name:"characterReference",tokenize:g2};function g2(e,t,a){let n=this,l=0,r,o;return i;function i(f){return e.enter("characterReference"),e.enter("characterReferenceMarker"),e.consume(f),e.exit("characterReferenceMarker"),u}function u(f){return f===35?(e.enter("characterReferenceMarkerNumeric"),e.consume(f),e.exit("characterReferenceMarkerNumeric"),c):(e.enter("characterReferenceValue"),r=31,o=Pe,s(f))}function c(f){return f===88||f===120?(e.enter("characterReferenceMarkerHexadecimal"),e.consume(f),e.exit("characterReferenceMarkerHexadecimal"),e.enter("characterReferenceValue"),r=6,o=ib,s):(e.enter("characterReferenceValue"),r=7,o=Zi,s(f))}function s(f){if(f===59&&l){let d=e.exit("characterReferenceValue");return o===Pe&&!oo(n.sliceSerialize(d))?a(f):(e.enter("characterReferenceMarker"),e.consume(f),e.exit("characterReferenceMarker"),e.exit("characterReference"),t)}return o(f)&&l++<r?(e.consume(f),s):a(f)}}var Wi={partial:!0,tokenize:x2};function x2(e,t,a){let n=this;return l;function l(o){return o===null?a(o):(e.enter("lineEnding"),e.consume(o),e.exit("lineEnding"),r)}function r(o){return n.parser.lazy[n.now().line]?a(o):t(o)}}var rc={concrete:!0,name:"codeFenced",tokenize:y2};function y2(e,t,a){let n=this,l={partial:!0,tokenize:I},r=0,o=0,i;return u;function u(C){return c(C)}function c(C){let T=n.events[n.events.length-1];return r=T&&T[1].type==="linePrefix"?T[2].sliceSerialize(T[1],!0).length:0,i=C,e.enter("codeFenced"),e.enter("codeFencedFence"),e.enter("codeFencedFenceSequence"),s(C)}function s(C){return C===i?(o++,e.consume(C),s):o<3?a(C):(e.exit("codeFencedFenceSequence"),Q(C)?Z(e,f,"whitespace")(C):f(C))}function f(C){return C===null||F(C)?(e.exit("codeFencedFence"),n.interrupt?t(C):e.check(Wi,y,L)(C)):(e.enter("codeFencedFenceInfo"),e.enter("chunkString",{contentType:"string"}),d(C))}function d(C){return C===null||F(C)?(e.exit("chunkString"),e.exit("codeFencedFenceInfo"),f(C)):Q(C)?(e.exit("chunkString"),e.exit("codeFencedFenceInfo"),Z(e,p,"whitespace")(C)):C===96&&C===i?a(C):(e.consume(C),d)}function p(C){return C===null||F(C)?f(C):(e.enter("codeFencedFenceMeta"),e.enter("chunkString",{contentType:"string"}),g(C))}function g(C){return C===null||F(C)?(e.exit("chunkString"),e.exit("codeFencedFenceMeta"),f(C)):C===96&&C===i?a(C):(e.consume(C),g)}function y(C){return e.attempt(l,L,w)(C)}function w(C){return e.enter("lineEnding"),e.consume(C),e.exit("lineEnding"),x}function x(C){return r>0&&Q(C)?Z(e,m,"linePrefix",r+1)(C):m(C)}function m(C){return C===null||F(C)?e.check(Wi,y,L)(C):(e.enter("codeFlowValue"),h(C))}function h(C){return C===null||F(C)?(e.exit("codeFlowValue"),m(C)):(e.consume(C),h)}function L(C){return e.exit("codeFenced"),t(C)}function I(C,T,N){let P=0;return k;function k(O){return C.enter("lineEnding"),C.consume(O),C.exit("lineEnding"),oe}function oe(O){return C.enter("codeFencedFence"),Q(O)?Z(C,ne,"linePrefix",n.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(O):ne(O)}function ne(O){return O===i?(C.enter("codeFencedFenceSequence"),z(O)):N(O)}function z(O){return O===i?(P++,C.consume(O),z):P>=o?(C.exit("codeFencedFenceSequence"),Q(O)?Z(C,E,"whitespace")(O):E(O)):N(O)}function E(O){return O===null||F(O)?(C.exit("codeFencedFence"),T(O)):N(O)}}}var $i={name:"codeIndented",tokenize:b2},L2={partial:!0,tokenize:v2};function b2(e,t,a){return n;function n(i){return e.enter("codeIndented"),em(e,l,a,"linePrefix",4,4)(i)}function l(i){return i===null?o(i):F(i)?e.attempt(L2,l,o)(i):(e.enter("codeFlowValue"),r(i))}function r(i){return i===null||F(i)?(e.exit("codeFlowValue"),l(i)):(e.consume(i),r)}function o(i){return e.exit("codeIndented"),t(i)}}function v2(e,t,a){let n=this;return l;function l(o){return n.parser.lazy[n.now().line]?a(o):F(o)?(e.enter("lineEnding"),e.consume(o),e.exit("lineEnding"),l):em(e,t,r,"linePrefix",4,4)(o)}function r(o){return F(o)?l(o):a(o)}}var am={name:"codeText",previous:S2,resolve:C2,tokenize:k2};function C2(e){let t=e.length-4,a=3,n,l;if((e[a][1].type==="lineEnding"||e[a][1].type==="space")&&(e[t][1].type==="lineEnding"||e[t][1].type==="space")){for(n=a;++n<t;)if(e[n][1].type==="codeTextData"){e[a][1].type="codeTextPadding",e[t][1].type="codeTextPadding",a+=2,t-=2;break}}for(n=a-1,t++;++n<=t;)l===void 0?n!==t&&e[n][1].type!=="lineEnding"&&(l=n):(n===t||e[n][1].type==="lineEnding")&&(e[l][1].type="codeTextData",n!==l+2&&(e[l][1].end=e[n-1][1].end,e.splice(l+2,n-l-2),t-=n-l-2,n=l+2),l=void 0);return e}function S2(e){return e!==96||this.events[this.events.length-1][1].type==="characterEscape"}function k2(e,t,a){let n=this,l=0,r,o;return i;function i(d){return e.enter("codeText"),e.enter("codeTextSequence"),u(d)}function u(d){return d===96?(e.consume(d),l++,u):(e.exit("codeTextSequence"),c(d))}function c(d){return d===null?a(d):d===32?(e.enter("space"),e.consume(d),e.exit("space"),c):d===96?(o=e.enter("codeTextSequence"),r=0,f(d)):F(d)?(e.enter("lineEnding"),e.consume(d),e.exit("lineEnding"),c):(e.enter("codeTextData"),s(d))}function s(d){return d===null||d===32||d===96||F(d)?(e.exit("codeTextData"),c(d)):(e.consume(d),s)}function f(d){return d===96?(e.consume(d),r++,f):r===l?(e.exit("codeTextSequence"),e.exit("codeText"),t(d)):(o.type="codeTextData",s(d))}}var oc=class{constructor(t){this.left=t?[...t]:[],this.right=[]}get(t){if(t<0||t>=this.left.length+this.right.length)throw new RangeError("Cannot access index `"+t+"` in a splice buffer of size `"+(this.left.length+this.right.length)+"`");return t<this.left.length?this.left[t]:this.right[this.right.length-t+this.left.length-1]}get length(){return this.left.length+this.right.length}shift(){return this.setCursor(0),this.right.pop()}slice(t,a){let n=a??Number.POSITIVE_INFINITY;return n<this.left.length?this.left.slice(t,n):t>this.left.length?this.right.slice(this.right.length-n+this.left.length,this.right.length-t+this.left.length).reverse():this.left.slice(t).concat(this.right.slice(this.right.length-n+this.left.length).reverse())}splice(t,a,n){let l=a||0;this.setCursor(Math.trunc(t));let r=this.right.splice(this.right.length-l,Number.POSITIVE_INFINITY);return n&&eu(this.left,n),r.reverse()}pop(){return this.setCursor(Number.POSITIVE_INFINITY),this.left.pop()}push(t){this.setCursor(Number.POSITIVE_INFINITY),this.left.push(t)}pushMany(t){this.setCursor(Number.POSITIVE_INFINITY),eu(this.left,t)}unshift(t){this.setCursor(0),this.right.push(t)}unshiftMany(t){this.setCursor(0),eu(this.right,t.reverse())}setCursor(t){if(!(t===this.left.length||t>this.left.length&&this.right.length===0||t<0&&this.left.length===0))if(t<this.left.length){let a=this.left.splice(t,Number.POSITIVE_INFINITY);eu(this.right,a.reverse())}else{let a=this.right.splice(this.left.length+this.right.length-t,Number.POSITIVE_INFINITY);eu(this.left,a.reverse())}}};function eu(e,t){let a=0;if(t.length<1e4)e.push(...t);else for(;a<t.length;)e.push(...t.slice(a,a+1e4)),a+=1e4}function ic(e){let t={},a=-1,n,l,r,o,i,u,c,s=new oc(e);for(;++a<s.length;){for(;a in t;)a=t[a];if(n=s.get(a),a&&n[1].type==="chunkFlow"&&s.get(a-1)[1].type==="listItemPrefix"&&(u=n[1]._tokenizer.events,r=0,r<u.length&&u[r][1].type==="lineEndingBlank"&&(r+=2),r<u.length&&u[r][1].type==="content"))for(;++r<u.length&&u[r][1].type!=="content";)u[r][1].type==="chunkText"&&(u[r][1]._isInFirstContentOfListItem=!0,r++);if(n[0]==="enter")n[1].contentType&&(Object.assign(t,w2(s,a)),a=t[a],c=!0);else if(n[1]._container){for(r=a,l=void 0;r--;)if(o=s.get(r),o[1].type==="lineEnding"||o[1].type==="lineEndingBlank")o[0]==="enter"&&(l&&(s.get(l)[1].type="lineEndingBlank"),o[1].type="lineEnding",l=r);else if(!(o[1].type==="linePrefix"||o[1].type==="listItemIndent"))break;l&&(n[1].end={...s.get(l)[1].start},i=s.slice(l,a),i.unshift(n),s.splice(l,a-l+1,i))}}return rt(e,0,Number.POSITIVE_INFINITY,s.slice(0)),!c}function w2(e,t){let a=e.get(t)[1],n=e.get(t)[2],l=t-1,r=[],o=a._tokenizer;o||(o=n.parser[a.contentType](a.start),a._contentTypeTextTrailing&&(o._contentTypeTextTrailing=!0));let i=o.events,u=[],c={},s,f,d=-1,p=a,g=0,y=0,w=[y];for(;p;){for(;e.get(++l)[1]!==p;);r.push(l),p._tokenizer||(s=n.sliceStream(p),p.next||s.push(null),f&&o.defineSkip(p.start),p._isInFirstContentOfListItem&&(o._gfmTasklistFirstContentOfListItem=!0),o.write(s),p._isInFirstContentOfListItem&&(o._gfmTasklistFirstContentOfListItem=void 0)),f=p,p=p.next}for(p=a;++d<i.length;)i[d][0]==="exit"&&i[d-1][0]==="enter"&&i[d][1].type===i[d-1][1].type&&i[d][1].start.line!==i[d][1].end.line&&(y=d+1,w.push(y),p._tokenizer=void 0,p.previous=void 0,p=p.next);for(o.events=[],p?(p._tokenizer=void 0,p.previous=void 0):w.pop(),d=w.length;d--;){let x=i.slice(w[d],w[d+1]),m=r.pop();u.push([m,m+x.length-1]),e.splice(m,2,x)}for(u.reverse(),d=-1;++d<u.length;)c[g+u[d][0]]=g+u[d][1],g+=u[d][1]-u[d][0]-1;return c}var nm={resolve:A2,tokenize:T2},I2={partial:!0,tokenize:D2};function A2(e){return ic(e),e}function T2(e,t){let a;return n;function n(i){return e.enter("content"),a=e.enter("chunkContent",{contentType:"content"}),l(i)}function l(i){return i===null?r(i):F(i)?e.check(I2,o,r)(i):(e.consume(i),l)}function r(i){return e.exit("chunkContent"),e.exit("content"),t(i)}function o(i){return e.consume(i),e.exit("chunkContent"),a.next=e.enter("chunkContent",{contentType:"content",previous:a}),a=a.next,l}}function D2(e,t,a){let n=this;return l;function l(o){return e.exit("chunkContent"),e.enter("lineEnding"),e.consume(o),e.exit("lineEnding"),Z(e,r,"linePrefix")}function r(o){if(o===null||F(o))return a(o);let i=n.events[n.events.length-1];return!n.parser.constructs.disable.null.includes("codeIndented")&&i&&i[1].type==="linePrefix"&&i[2].sliceSerialize(i[1],!0).length>=4?t(o):e.interrupt(n.parser.constructs.flow,a,t)(o)}}function uc(e,t,a,n,l,r,o,i,u){let c=u||Number.POSITIVE_INFINITY,s=0;return f;function f(x){return x===60?(e.enter(n),e.enter(l),e.enter(r),e.consume(x),e.exit(r),d):x===null||x===32||x===41||Kl(x)?a(x):(e.enter(n),e.enter(o),e.enter(i),e.enter("chunkString",{contentType:"string"}),y(x))}function d(x){return x===62?(e.enter(r),e.consume(x),e.exit(r),e.exit(l),e.exit(n),t):(e.enter(i),e.enter("chunkString",{contentType:"string"}),p(x))}function p(x){return x===62?(e.exit("chunkString"),e.exit(i),d(x)):x===null||x===60||F(x)?a(x):(e.consume(x),x===92?g:p)}function g(x){return x===60||x===62||x===92?(e.consume(x),p):p(x)}function y(x){return!s&&(x===null||x===41||ie(x))?(e.exit("chunkString"),e.exit(i),e.exit(o),e.exit(n),t(x)):s<c&&x===40?(e.consume(x),s++,y):x===41?(e.consume(x),s--,y):x===null||x===32||x===40||Kl(x)?a(x):(e.consume(x),x===92?w:y)}function w(x){return x===40||x===41||x===92?(e.consume(x),y):y(x)}}function sc(e,t,a,n,l,r){let o=this,i=0,u;return c;function c(p){return e.enter(n),e.enter(l),e.consume(p),e.exit(l),e.enter(r),s}function s(p){return i>999||p===null||p===91||p===93&&!u||p===94&&!i&&"_hiddenFootnoteSupport"in o.parser.constructs?a(p):p===93?(e.exit(r),e.enter(l),e.consume(p),e.exit(l),e.exit(n),t):F(p)?(e.enter("lineEnding"),e.consume(p),e.exit("lineEnding"),s):(e.enter("chunkString",{contentType:"string"}),f(p))}function f(p){return p===null||p===91||p===93||F(p)||i++>999?(e.exit("chunkString"),s(p)):(e.consume(p),u||(u=!Q(p)),p===92?d:f)}function d(p){return p===91||p===92||p===93?(e.consume(p),i++,f):f(p)}}function cc(e,t,a,n,l,r){let o;return i;function i(d){return d===34||d===39||d===40?(e.enter(n),e.enter(l),e.consume(d),e.exit(l),o=d===40?41:d,u):a(d)}function u(d){return d===o?(e.enter(l),e.consume(d),e.exit(l),e.exit(n),t):(e.enter(r),c(d))}function c(d){return d===o?(e.exit(r),u(o)):d===null?a(d):F(d)?(e.enter("lineEnding"),e.consume(d),e.exit("lineEnding"),Z(e,c,"linePrefix")):(e.enter("chunkString",{contentType:"string"}),s(d))}function s(d){return d===o||d===null||F(d)?(e.exit("chunkString"),c(d)):(e.consume(d),d===92?f:s)}function f(d){return d===o||d===92?(e.consume(d),s):s(d)}}function Jl(e,t){let a;return n;function n(l){return F(l)?(e.enter("lineEnding"),e.consume(l),e.exit("lineEnding"),a=!0,n):Q(l)?Z(e,n,a?"linePrefix":"lineSuffix")(l):t(l)}}var lm={name:"definition",tokenize:E2},M2={partial:!0,tokenize:z2};function E2(e,t,a){let n=this,l;return r;function r(p){return e.enter("definition"),o(p)}function o(p){return sc.call(n,e,i,a,"definitionLabel","definitionLabelMarker","definitionLabelString")(p)}function i(p){return l=gt(n.sliceSerialize(n.events[n.events.length-1][1]).slice(1,-1)),p===58?(e.enter("definitionMarker"),e.consume(p),e.exit("definitionMarker"),u):a(p)}function u(p){return ie(p)?Jl(e,c)(p):c(p)}function c(p){return uc(e,s,a,"definitionDestination","definitionDestinationLiteral","definitionDestinationLiteralMarker","definitionDestinationRaw","definitionDestinationString")(p)}function s(p){return e.attempt(M2,f,f)(p)}function f(p){return Q(p)?Z(e,d,"whitespace")(p):d(p)}function d(p){return p===null||F(p)?(e.exit("definition"),n.parser.defined.push(l),t(p)):a(p)}}function z2(e,t,a){return n;function n(i){return ie(i)?Jl(e,l)(i):a(i)}function l(i){return cc(e,r,a,"definitionTitle","definitionTitleMarker","definitionTitleString")(i)}function r(i){return Q(i)?Z(e,o,"whitespace")(i):o(i)}function o(i){return i===null||F(i)?t(i):a(i)}}var rm={name:"hardBreakEscape",tokenize:B2};function B2(e,t,a){return n;function n(r){return e.enter("hardBreakEscape"),e.consume(r),l}function l(r){return F(r)?(e.exit("hardBreakEscape"),t(r)):a(r)}}var om={name:"headingAtx",resolve:R2,tokenize:O2};function R2(e,t){let a=e.length-2,n=3;if(e[n][1].type==="whitespace"&&(n+=2),a-2>n&&e[a][1].type==="whitespace"&&(a-=2),e[a][1].type==="atxHeadingSequence"&&(n===a-1||a-4>n&&e[a-2][1].type==="whitespace")&&(a-=n+1===a?2:4),a>n){let l={type:"atxHeadingText",start:e[n][1].start,end:e[a][1].end},r={type:"chunkText",start:e[n][1].start,end:e[a][1].end,contentType:"text"};rt(e,n,a-n+1,[["enter",l,t],["enter",r,t],["exit",r,t],["exit",l,t]])}return e}function O2(e,t,a){let n=0;return l;function l(s){return e.enter("atxHeading"),r(s)}function r(s){return e.enter("atxHeadingSequence"),o(s)}function o(s){return s===35&&n++<6?(e.consume(s),o):s===null||ie(s)?(e.exit("atxHeadingSequence"),i(s)):a(s)}function i(s){return s===35?(e.enter("atxHeadingSequence"),u(s)):s===null||F(s)?(e.exit("atxHeading"),t(s)):Q(s)?Z(e,i,"whitespace")(s):(e.enter("atxHeadingText"),c(s))}function u(s){return s===35?(e.consume(s),u):(e.exit("atxHeadingSequence"),i(s))}function c(s){return s===null||s===35||ie(s)?(e.exit("atxHeadingText"),i(s)):(e.consume(s),c)}}var mb=["address","article","aside","base","basefont","blockquote","body","caption","center","col","colgroup","dd","details","dialog","dir","div","dl","dt","fieldset","figcaption","figure","footer","form","frame","frameset","h1","h2","h3","h4","h5","h6","head","header","hr","html","iframe","legend","li","link","main","menu","menuitem","nav","noframes","ol","optgroup","option","p","param","search","section","summary","table","tbody","td","tfoot","th","thead","title","tr","track","ul"],im=["pre","script","style","textarea"];var um={concrete:!0,name:"htmlFlow",resolveTo:q2,tokenize:U2},N2={partial:!0,tokenize:P2};function q2(e){let t=e.length;for(;t--&&!(e[t][0]==="enter"&&e[t][1].type==="htmlFlow"););return t>1&&e[t-2][1].type==="linePrefix"&&(e[t][1].start=e[t-2][1].start,e[t+1][1].start=e[t-2][1].start,e.splice(t-2,2)),e}function U2(e,t,a){let n=this,l,r,o,i,u;return c;function c(v){return s(v)}function s(v){return e.enter("htmlFlow"),e.enter("htmlFlowData"),e.consume(v),f}function f(v){return v===33?(e.consume(v),d):v===47?(e.consume(v),r=!0,y):v===63?(e.consume(v),l=3,n.interrupt?t:b):$e(v)?(e.consume(v),o=String.fromCharCode(v),w):a(v)}function d(v){return v===45?(e.consume(v),l=2,p):v===91?(e.consume(v),l=5,i=0,g):$e(v)?(e.consume(v),l=4,n.interrupt?t:b):a(v)}function p(v){return v===45?(e.consume(v),n.interrupt?t:b):a(v)}function g(v){let Ut="CDATA[";return v===Ut.charCodeAt(i++)?(e.consume(v),i===Ut.length?n.interrupt?t:ne:g):a(v)}function y(v){return $e(v)?(e.consume(v),o=String.fromCharCode(v),w):a(v)}function w(v){if(v===null||v===47||v===62||ie(v)){let Ut=v===47,cl=o.toLowerCase();return!Ut&&!r&&im.includes(cl)?(l=1,n.interrupt?t(v):ne(v)):mb.includes(o.toLowerCase())?(l=6,Ut?(e.consume(v),x):n.interrupt?t(v):ne(v)):(l=7,n.interrupt&&!n.parser.lazy[n.now().line]?a(v):r?m(v):h(v))}return v===45||Pe(v)?(e.consume(v),o+=String.fromCharCode(v),w):a(v)}function x(v){return v===62?(e.consume(v),n.interrupt?t:ne):a(v)}function m(v){return Q(v)?(e.consume(v),m):k(v)}function h(v){return v===47?(e.consume(v),k):v===58||v===95||$e(v)?(e.consume(v),L):Q(v)?(e.consume(v),h):k(v)}function L(v){return v===45||v===46||v===58||v===95||Pe(v)?(e.consume(v),L):I(v)}function I(v){return v===61?(e.consume(v),C):Q(v)?(e.consume(v),I):h(v)}function C(v){return v===null||v===60||v===61||v===62||v===96?a(v):v===34||v===39?(e.consume(v),u=v,T):Q(v)?(e.consume(v),C):N(v)}function T(v){return v===u?(e.consume(v),u=null,P):v===null||F(v)?a(v):(e.consume(v),T)}function N(v){return v===null||v===34||v===39||v===47||v===60||v===61||v===62||v===96||ie(v)?I(v):(e.consume(v),N)}function P(v){return v===47||v===62||Q(v)?h(v):a(v)}function k(v){return v===62?(e.consume(v),oe):a(v)}function oe(v){return v===null||F(v)?ne(v):Q(v)?(e.consume(v),oe):a(v)}function ne(v){return v===45&&l===2?(e.consume(v),$):v===60&&l===1?(e.consume(v),Ee):v===62&&l===4?(e.consume(v),wt):v===63&&l===3?(e.consume(v),b):v===93&&l===5?(e.consume(v),qt):F(v)&&(l===6||l===7)?(e.exit("htmlFlowData"),e.check(N2,Jt,z)(v)):v===null||F(v)?(e.exit("htmlFlowData"),z(v)):(e.consume(v),ne)}function z(v){return e.check(Wi,E,Jt)(v)}function E(v){return e.enter("lineEnding"),e.consume(v),e.exit("lineEnding"),O}function O(v){return v===null||F(v)?z(v):(e.enter("htmlFlowData"),ne(v))}function $(v){return v===45?(e.consume(v),b):ne(v)}function Ee(v){return v===47?(e.consume(v),o="",Nt):ne(v)}function Nt(v){if(v===62){let Ut=o.toLowerCase();return im.includes(Ut)?(e.consume(v),wt):ne(v)}return $e(v)&&o.length<8?(e.consume(v),o+=String.fromCharCode(v),Nt):ne(v)}function qt(v){return v===93?(e.consume(v),b):ne(v)}function b(v){return v===62?(e.consume(v),wt):v===45&&l===2?(e.consume(v),b):ne(v)}function wt(v){return v===null||F(v)?(e.exit("htmlFlowData"),Jt(v)):(e.consume(v),wt)}function Jt(v){return e.exit("htmlFlow"),t(v)}}function P2(e,t,a){return n;function n(l){return e.enter("lineEnding"),e.consume(l),e.exit("lineEnding"),e.attempt(Pa,t,a)}}var sm={name:"htmlText",tokenize:F2};function F2(e,t,a){let n=this,l,r,o;return i;function i(b){return e.enter("htmlText"),e.enter("htmlTextData"),e.consume(b),u}function u(b){return b===33?(e.consume(b),c):b===47?(e.consume(b),I):b===63?(e.consume(b),h):$e(b)?(e.consume(b),N):a(b)}function c(b){return b===45?(e.consume(b),s):b===91?(e.consume(b),r=0,g):$e(b)?(e.consume(b),m):a(b)}function s(b){return b===45?(e.consume(b),p):a(b)}function f(b){return b===null?a(b):b===45?(e.consume(b),d):F(b)?(o=f,Ee(b)):(e.consume(b),f)}function d(b){return b===45?(e.consume(b),p):f(b)}function p(b){return b===62?$(b):b===45?d(b):f(b)}function g(b){let wt="CDATA[";return b===wt.charCodeAt(r++)?(e.consume(b),r===wt.length?y:g):a(b)}function y(b){return b===null?a(b):b===93?(e.consume(b),w):F(b)?(o=y,Ee(b)):(e.consume(b),y)}function w(b){return b===93?(e.consume(b),x):y(b)}function x(b){return b===62?$(b):b===93?(e.consume(b),x):y(b)}function m(b){return b===null||b===62?$(b):F(b)?(o=m,Ee(b)):(e.consume(b),m)}function h(b){return b===null?a(b):b===63?(e.consume(b),L):F(b)?(o=h,Ee(b)):(e.consume(b),h)}function L(b){return b===62?$(b):h(b)}function I(b){return $e(b)?(e.consume(b),C):a(b)}function C(b){return b===45||Pe(b)?(e.consume(b),C):T(b)}function T(b){return F(b)?(o=T,Ee(b)):Q(b)?(e.consume(b),T):$(b)}function N(b){return b===45||Pe(b)?(e.consume(b),N):b===47||b===62||ie(b)?P(b):a(b)}function P(b){return b===47?(e.consume(b),$):b===58||b===95||$e(b)?(e.consume(b),k):F(b)?(o=P,Ee(b)):Q(b)?(e.consume(b),P):$(b)}function k(b){return b===45||b===46||b===58||b===95||Pe(b)?(e.consume(b),k):oe(b)}function oe(b){return b===61?(e.consume(b),ne):F(b)?(o=oe,Ee(b)):Q(b)?(e.consume(b),oe):P(b)}function ne(b){return b===null||b===60||b===61||b===62||b===96?a(b):b===34||b===39?(e.consume(b),l=b,z):F(b)?(o=ne,Ee(b)):Q(b)?(e.consume(b),ne):(e.consume(b),E)}function z(b){return b===l?(e.consume(b),l=void 0,O):b===null?a(b):F(b)?(o=z,Ee(b)):(e.consume(b),z)}function E(b){return b===null||b===34||b===39||b===60||b===61||b===96?a(b):b===47||b===62||ie(b)?P(b):(e.consume(b),E)}function O(b){return b===47||b===62||ie(b)?P(b):a(b)}function $(b){return b===62?(e.consume(b),e.exit("htmlTextData"),e.exit("htmlText"),t):a(b)}function Ee(b){return e.exit("htmlTextData"),e.enter("lineEnding"),e.consume(b),e.exit("lineEnding"),Nt}function Nt(b){return Q(b)?Z(e,qt,"linePrefix",n.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(b):qt(b)}function qt(b){return e.enter("htmlTextData"),o(b)}}var Wl={name:"labelEnd",resolveAll:V2,resolveTo:j2,tokenize:X2},H2={tokenize:Q2},_2={tokenize:Y2},G2={tokenize:K2};function V2(e){let t=-1,a=[];for(;++t<e.length;){let n=e[t][1];if(a.push(e[t]),n.type==="labelImage"||n.type==="labelLink"||n.type==="labelEnd"){let l=n.type==="labelImage"?4:2;n.type="data",t+=l}}return e.length!==a.length&&rt(e,0,e.length,a),e}function j2(e,t){let a=e.length,n=0,l,r,o;for(;a--;){let s=e[a][1];if(l){if(s.type==="link"||s.type==="labelLink"&&s._inactive)break;e[a][0]==="enter"&&s.type==="labelLink"&&(s._inactive=!0)}else if(r){if(e[a][0]==="enter"&&(s.type==="labelImage"||s.type==="labelLink")&&!s._balanced&&(l=a,s.type!=="labelLink")){n=2;break}}else s.type==="labelEnd"&&(r=a)}let i={type:e[l][1].type==="labelLink"?"link":"image",start:{...e[l][1].start},end:{...e[e.length-1][1].end}},u={type:"label",start:{...e[l][1].start},end:{...e[r][1].end}},c={type:"labelText",start:{...e[l+n+2][1].end},end:{...e[r-2][1].start}};return o=[["enter",i,t],["enter",u,t]],o=kt(o,e.slice(l+1,l+n+3)),o=kt(o,[["enter",c,t]]),o=kt(o,il(t.parser.constructs.insideSpan.null,e.slice(l+n+4,r-3),t)),o=kt(o,[["exit",c,t],e[r-2],e[r-1],["exit",u,t]]),o=kt(o,e.slice(r+1)),o=kt(o,[["exit",i,t]]),rt(e,l,e.length,o),e}function X2(e,t,a){let n=this,l=n._labelStarts,r,o;if(l){for(;l.length>0&&l[l.length-1]._balanced;)l.pop();r=l[l.length-1]}return i;function i(d){return r?r._inactive?f(d):(o=n.parser.defined.includes(gt(n.sliceSerialize({start:r.end,end:n.now()}))),e.enter("labelEnd"),e.enter("labelMarker"),e.consume(d),e.exit("labelMarker"),e.exit("labelEnd"),u):a(d)}function u(d){return d===40?e.attempt(H2,s,o?s:f)(d):d===91?e.attempt(_2,s,o?c:f)(d):o?s(d):f(d)}function c(d){return e.attempt(G2,s,f)(d)}function s(d){return l.pop(),t(d)}function f(d){return r._balanced=!0,a(d)}}function Q2(e,t,a){return n;function n(f){return e.enter("resource"),e.enter("resourceMarker"),e.consume(f),e.exit("resourceMarker"),l}function l(f){return ie(f)?Jl(e,r)(f):r(f)}function r(f){return f===41?s(f):uc(e,o,i,"resourceDestination","resourceDestinationLiteral","resourceDestinationLiteralMarker","resourceDestinationRaw","resourceDestinationString",32)(f)}function o(f){return ie(f)?Jl(e,u)(f):s(f)}function i(f){return a(f)}function u(f){return f===34||f===39||f===40?cc(e,c,a,"resourceTitle","resourceTitleMarker","resourceTitleString")(f):s(f)}function c(f){return ie(f)?Jl(e,s)(f):s(f)}function s(f){return f===41?(e.enter("resourceMarker"),e.consume(f),e.exit("resourceMarker"),e.exit("resource"),t):a(f)}}function Y2(e,t,a){let n=this;return l;function l(i){return sc.call(n,e,r,o,"reference","referenceMarker","referenceString")(i)}function r(i){return n.parser.defined.includes(gt(n.sliceSerialize(n.events[n.events.length-1][1]).slice(1,-1)))?t(i):a(i)}function o(i){return a(i)}}function K2(e,t,a){return n;function n(r){return e.enter("reference"),e.enter("referenceMarker"),e.consume(r),e.exit("referenceMarker"),l}function l(r){return r===93?(e.enter("referenceMarker"),e.consume(r),e.exit("referenceMarker"),e.exit("reference"),t):a(r)}}var cm={name:"labelStartImage",resolveAll:Wl.resolveAll,tokenize:Z2};function Z2(e,t,a){let n=this,l;return r;function r(u){return e.enter("labelImage"),e.enter("labelImageMarker"),e.consume(u),e.exit("labelImageMarker"),o}function o(u){return u===91?(e.enter("labelMarker"),e.consume(u),e.exit("labelMarker"),l=e.exit("labelImage"),i):a(u)}function i(u){return u===94&&"_hiddenFootnoteSupport"in n.parser.constructs?a(u):(n._labelStarts=n._labelStarts||[],n._labelStarts.push(l),t(u))}}var fm={name:"labelStartLink",resolveAll:Wl.resolveAll,tokenize:J2};function J2(e,t,a){let n=this,l;return r;function r(i){return e.enter("labelLink"),e.enter("labelMarker"),e.consume(i),e.exit("labelMarker"),l=e.exit("labelLink"),o}function o(i){return i===94&&"_hiddenFootnoteSupport"in n.parser.constructs?a(i):(n._labelStarts=n._labelStarts||[],n._labelStarts.push(l),t(i))}}var tu={name:"lineEnding",tokenize:W2};function W2(e,t){return a;function a(n){return e.enter("lineEnding"),e.consume(n),e.exit("lineEnding"),Z(e,t,"linePrefix")}}var $l={name:"thematicBreak",tokenize:$2};function $2(e,t,a){let n=0,l;return r;function r(c){return e.enter("thematicBreak"),o(c)}function o(c){return l=c,i(c)}function i(c){return c===l?(e.enter("thematicBreakSequence"),u(c)):n>=3&&(c===null||F(c))?(e.exit("thematicBreak"),t(c)):a(c)}function u(c){return c===l?(e.consume(c),n++,u):(e.exit("thematicBreakSequence"),Q(c)?Z(e,i,"whitespace")(c):i(c))}}var xt={continuation:{tokenize:nA},exit:rA,name:"list",tokenize:aA},eA={partial:!0,tokenize:oA},tA={partial:!0,tokenize:lA};function aA(e,t,a){let n=this,l=n.events[n.events.length-1],r=l&&l[1].type==="linePrefix"?l[2].sliceSerialize(l[1],!0).length:0,o=0;return i;function i(p){let g=n.containerState.type||(p===42||p===43||p===45?"listUnordered":"listOrdered");if(g==="listUnordered"?!n.containerState.marker||p===n.containerState.marker:Zi(p)){if(n.containerState.type||(n.containerState.type=g,e.enter(g,{_container:!0})),g==="listUnordered")return e.enter("listItemPrefix"),p===42||p===45?e.check($l,a,c)(p):c(p);if(!n.interrupt||p===49)return e.enter("listItemPrefix"),e.enter("listItemValue"),u(p)}return a(p)}function u(p){return Zi(p)&&++o<10?(e.consume(p),u):(!n.interrupt||o<2)&&(n.containerState.marker?p===n.containerState.marker:p===41||p===46)?(e.exit("listItemValue"),c(p)):a(p)}function c(p){return e.enter("listItemMarker"),e.consume(p),e.exit("listItemMarker"),n.containerState.marker=n.containerState.marker||p,e.check(Pa,n.interrupt?a:s,e.attempt(eA,d,f))}function s(p){return n.containerState.initialBlankLine=!0,r++,d(p)}function f(p){return Q(p)?(e.enter("listItemPrefixWhitespace"),e.consume(p),e.exit("listItemPrefixWhitespace"),d):a(p)}function d(p){return n.containerState.size=r+n.sliceSerialize(e.exit("listItemPrefix"),!0).length,t(p)}}function nA(e,t,a){let n=this;return n.containerState._closeFlow=void 0,e.check(Pa,l,r);function l(i){return n.containerState.furtherBlankLines=n.containerState.furtherBlankLines||n.containerState.initialBlankLine,Z(e,t,"listItemIndent",n.containerState.size+1)(i)}function r(i){return n.containerState.furtherBlankLines||!Q(i)?(n.containerState.furtherBlankLines=void 0,n.containerState.initialBlankLine=void 0,o(i)):(n.containerState.furtherBlankLines=void 0,n.containerState.initialBlankLine=void 0,e.attempt(tA,t,o)(i))}function o(i){return n.containerState._closeFlow=!0,n.interrupt=void 0,Z(e,e.attempt(xt,t,a),"linePrefix",n.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(i)}}function lA(e,t,a){let n=this;return Z(e,l,"listItemIndent",n.containerState.size+1);function l(r){let o=n.events[n.events.length-1];return o&&o[1].type==="listItemIndent"&&o[2].sliceSerialize(o[1],!0).length===n.containerState.size?t(r):a(r)}}function rA(e){e.exit(this.containerState.type)}function oA(e,t,a){let n=this;return Z(e,l,"listItemPrefixWhitespace",n.parser.constructs.disable.null.includes("codeIndented")?void 0:5);function l(r){let o=n.events[n.events.length-1];return!Q(r)&&o&&o[1].type==="listItemPrefixWhitespace"?t(r):a(r)}}var fc={name:"setextUnderline",resolveTo:iA,tokenize:uA};function iA(e,t){let a=new Ln,n=e.length,l,r,o;for(;n--;)if(e[n][0]==="enter"){if(e[n][1].type==="content"){l=n;break}e[n][1].type==="paragraph"&&(r=n)}else e[n][1].type==="content"&&a.add(n,1,[]),!o&&e[n][1].type==="definition"&&(o=n);let i={type:"setextHeading",start:{...e[l][1].start},end:{...e[e.length-1][1].end}};return e[r][1].type="setextHeadingText",o?(a.add(r,0,[["enter",i,t]]),a.add(o+1,0,[["exit",e[l][1],t]]),e[l][1].end={...e[o][1].end}):e[l][1]=i,a.add(e.length,0,[["exit",i,t]]),a.consume(e),e}function uA(e,t,a){let n=this,l;return r;function r(c){let s=n.events.length,f;for(;s--;)if(n.events[s][1].type!=="lineEnding"&&n.events[s][1].type!=="linePrefix"&&n.events[s][1].type!=="content"){f=n.events[s][1].type==="paragraph";break}return!n.parser.lazy[n.now().line]&&(n.interrupt||f)?(e.enter("setextHeadingLine"),l=c,o(c)):a(c)}function o(c){return e.enter("setextHeadingLineSequence"),i(c)}function i(c){return c===l?(e.consume(c),i):(e.exit("setextHeadingLineSequence"),Q(c)?Z(e,u,"lineSuffix")(c):u(c))}function u(c){return c===null||F(c)?(e.exit("setextHeadingLine"),t(c)):a(c)}}var hb={tokenize:sA};function sA(e){let t=this,a=e.attempt(Pa,n,e.attempt(this.parser.constructs.flowInitial,l,Z(e,e.attempt(this.parser.constructs.flow,l,e.attempt(nm,l)),"linePrefix")));return a;function n(r){if(r===null){e.consume(r);return}return e.enter("lineEndingBlank"),e.consume(r),e.exit("lineEndingBlank"),t.currentConstruct=void 0,a}function l(r){if(r===null){e.consume(r);return}return e.enter("lineEnding"),e.consume(r),e.exit("lineEnding"),t.currentConstruct=void 0,a}}var gb={resolveAll:bb()},xb=Lb("string"),yb=Lb("text");function Lb(e){return{resolveAll:bb(e==="text"?cA:void 0),tokenize:t};function t(a){let n=this,l=this.parser.constructs[e],r=a.attempt(l,o,i);return o;function o(s){return c(s)?r(s):i(s)}function i(s){if(s===null){a.consume(s);return}return a.enter("data"),a.consume(s),u}function u(s){return c(s)?(a.exit("data"),r(s)):(a.consume(s),u)}function c(s){if(s===null)return!0;let f=l[s],d=-1;if(f)for(;++d<f.length;){let p=f[d];if(!p.previous||p.previous.call(n,n.previous))return!0}return!1}}}function bb(e){return t;function t(a,n){let l=-1,r;for(;++l<=a.length;)r===void 0?a[l]&&a[l][1].type==="data"&&(r=l,l++):(!a[l]||a[l][1].type!=="data")&&(l!==r+2&&(a[r][1].end=a[l-1][1].end,a.splice(r+2,l-r-2),l=r+2),r=void 0);return e?e(a,n):a}}function cA(e,t){let a=new Ln,n=0;for(;++n<=e.length;)if((n===e.length||e[n][1].type==="lineEnding")&&e[n-1][1].type==="data"){let l=e[n-1][1],r=t.sliceStream(l),o=r.length,i=-1,u=0,c;for(;o--;){let s=r[o];if(typeof s=="string"){for(i=s.length;s.charCodeAt(i-1)===32;)u++,i--;if(i)break;i=-1}else if(s===-2)c=!0,u++;else if(s!==-1){o++;break}}if(t._contentTypeTextTrailing&&n===e.length&&(u=0),u){let s={type:n===e.length||c||u<2?"lineSuffix":"hardBreakTrailing",start:{_bufferIndex:o?i:l.start._bufferIndex+i,_index:l.start._index+o,line:l.end.line,column:l.end.column-u,offset:l.end.offset-u},end:{...l.end}};l.end={...s.start},l.start.offset===l.end.offset?Object.assign(l,s):a.add(n,0,[["enter",s,t],["exit",s,t]])}n++}return a.consume(e),e}var dm={};Dh(dm,{attentionMarkers:()=>yA,contentInitial:()=>dA,disable:()=>LA,document:()=>fA,flow:()=>mA,flowInitial:()=>pA,insideSpan:()=>xA,string:()=>hA,text:()=>gA});var fA={42:xt,43:xt,45:xt,48:xt,49:xt,50:xt,51:xt,52:xt,53:xt,54:xt,55:xt,56:xt,57:xt,62:ac},dA={91:lm},pA={[-2]:$i,[-1]:$i,32:$i},mA={35:om,42:$l,45:[fc,$l],60:um,61:fc,95:$l,96:rc,126:rc},hA={38:lc,92:nc},gA={[-5]:tu,[-4]:tu,[-3]:tu,33:cm,38:lc,42:Ji,60:[tm,sm],91:fm,92:[rm,nc],93:Wl,95:Ji,96:am},xA={null:[Ji,gb]},yA={null:[42,95]},LA={null:[]};function vb(e,t,a){let n={_bufferIndex:-1,_index:0,line:a&&a.line||1,column:a&&a.column||1,offset:a&&a.offset||0},l={},r=[],o=[],i=[],u=!0,c={attempt:P(T),check:P(N),consume:L,enter:I,exit:C,interrupt:P(N,{interrupt:!0})},s={code:null,containerState:{},defineSkip:x,events:[],now:w,parser:e,previous:null,sliceSerialize:g,sliceStream:y,write:p},f=t.tokenize.call(s,c),d;return t.resolveAll&&r.push(t),s;function p(z){return o=kt(o,z),m(),o[o.length-1]!==null?[]:(k(t,0),s.events=il(r,s.events,s),s.events)}function g(z,E){return vA(y(z),E)}function y(z){return bA(o,z)}function w(){let{_bufferIndex:z,_index:E,line:O,column:$,offset:Ee}=n;return{_bufferIndex:z,_index:E,line:O,column:$,offset:Ee}}function x(z){l[z.line]=z.column,ne()}function m(){for(;n._index<o.length;){let z=o[n._index];if(typeof z=="string"){let E=n._index;for(n._bufferIndex<0&&(n._bufferIndex=0);n._index===E&&n._bufferIndex<z.length;)h(z.charCodeAt(n._bufferIndex))}else h(z)}}function h(z){u=void 0,d=z,f=f(z)}function L(z){F(z)?(n.line++,n.column=1,n.offset+=z===-3?2:1,ne()):z!==-1&&(n.column++,n.offset++),n._bufferIndex<0?n._index++:(n._bufferIndex++,n._bufferIndex===o[n._index].length&&(n._bufferIndex=-1,n._index++)),s.previous=z,u=!0}function I(z,E){let O=E||{};return O.type=z,O.start=w(),s.events.push(["enter",O,s]),i.push(O),O}function C(z){let E=i.pop();return E.end=w(),s.events.push(["exit",E,s]),E}function T(z,E){k(z,E.from)}function N(z,E){E.restore()}function P(z,E){return O;function O($,Ee,Nt){let qt,b,wt,Jt;return Array.isArray($)?Ut($):"tokenize"in $?Ut([$]):v($);function v(ot){return yo;function yo(_a){let fl=_a!==null&&ot[_a],ir=_a!==null&&ot.null,Qc=[...Array.isArray(fl)?fl:fl?[fl]:[],...Array.isArray(ir)?ir:ir?[ir]:[]];return Ut(Qc)(_a)}}function Ut(ot){return qt=ot,b=0,ot.length===0?Nt:cl(ot[b])}function cl(ot){return yo;function yo(_a){return Jt=oe(),wt=ot,ot.partial||(s.currentConstruct=ot),ot.name&&s.parser.constructs.disable.null.includes(ot.name)?du(_a):ot.tokenize.call(E?Object.assign(Object.create(s),E):s,c,Xc,du)(_a)}}function Xc(ot){return u=!0,z(wt,Jt),Ee}function du(ot){return u=!0,Jt.restore(),++b<qt.length?cl(qt[b]):Nt}}}function k(z,E){z.resolveAll&&!r.includes(z)&&r.push(z),z.resolve&&rt(s.events,E,s.events.length-E,z.resolve(s.events.slice(E),s)),z.resolveTo&&(s.events=z.resolveTo(s.events,s))}function oe(){let z=w(),E=s.previous,O=s.currentConstruct,$=s.events.length,Ee=Array.from(i);return{from:$,restore:Nt};function Nt(){n=z,s.previous=E,s.currentConstruct=O,s.events.length=$,i=Ee,ne()}}function ne(){n.line in l&&n.column<2&&(n.column=l[n.line],n.offset+=l[n.line]-1)}}function bA(e,t){let a=t.start._index,n=t.start._bufferIndex,l=t.end._index,r=t.end._bufferIndex,o;if(a===l)o=[e[a].slice(n,r)];else{if(o=e.slice(a,l),n>-1){let i=o[0];typeof i=="string"?o[0]=i.slice(n):o.shift()}r>0&&o.push(e[l].slice(0,r))}return o}function vA(e,t){let a=-1,n=[],l;for(;++a<e.length;){let r=e[a],o;if(typeof r=="string")o=r;else switch(r){case-5:{o="\r";break}case-4:{o=`
`;break}case-3:{o=`\r
`;break}case-2:{o=t?" ":"	";break}case-1:{if(!t&&l)continue;o=" ";break}default:o=String.fromCharCode(r)}l=r===-2,n.push(o)}return n.join("")}function pm(e){let n={constructs:ec([dm,...(e||{}).extensions||[]]),content:l(sb),defined:[],document:l(db),flow:l(hb),lazy:{},string:l(xb),text:l(yb)};return n;function l(r){return o;function o(i){return vb(n,r,i)}}}function mm(e){for(;!ic(e););return e}var Cb=/[\0\t\n\r]/g;function hm(){let e=1,t="",a=!0,n;return l;function l(r,o,i){r=t+(typeof r=="string"?r.toString():new TextDecoder(o||void 0).decode(r));let u=[],c=0;for(t="",a&&(r.charCodeAt(0)===65279&&c++,a=void 0);c<r.length;){Cb.lastIndex=c;let s=Cb.exec(r),f=s&&s.index!==void 0?s.index:r.length,d=r.charCodeAt(f);if(!s){t=r.slice(c);break}if(d===10&&c===f&&n)u.push(-3),n=void 0;else switch(n&&(u.push(-5),n=void 0),c<f&&(u.push(r.slice(c,f)),e+=f-c),d){case 0:{u.push(65533),e++;break}case 9:{let p=Math.ceil(e/4)*4;for(u.push(-2);e++<p;)u.push(-1);break}case 10:{u.push(-4),e=1;break}default:n=!0,e=1}c=f+1}return i&&(n&&u.push(-5),t&&u.push(t),u.push(null)),u}}var CA=/\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;function Sb(e){return e.replace(CA,SA)}function SA(e,t,a){if(t)return t;if(a.charCodeAt(0)===35){let l=a.charCodeAt(1),r=l===120||l===88;return tc(a.slice(r?2:1),r?16:10)}return oo(a)||e}var wb={}.hasOwnProperty;function gm(e,t,a){return t&&typeof t=="object"&&(a=t,t=void 0),kA(a)(mm(pm(a).document().write(hm()(e,t,!0))))}function kA(e){let t={transforms:[],canContainEols:["emphasis","fragment","heading","paragraph","strong"],enter:{autolink:r(Ah),autolinkProtocol:P,autolinkEmail:P,atxHeading:r(kh),blockQuote:r(_a),characterEscape:P,characterReference:P,codeFenced:r(fl),codeFencedFenceInfo:o,codeFencedFenceMeta:o,codeIndented:r(fl,o),codeText:r(ir,o),codeTextData:P,data:P,codeFlowValue:P,definition:r(Qc),definitionDestinationString:o,definitionLabelString:o,definitionTitleString:o,emphasis:r(H0),hardBreakEscape:r(wh),hardBreakTrailing:r(wh),htmlFlow:r(Ih,o),htmlFlowData:P,htmlText:r(Ih,o),htmlTextData:P,image:r(_0),label:o,link:r(Ah),listItem:r(G0),listItemValue:d,listOrdered:r(Th,f),listUnordered:r(Th),paragraph:r(V0),reference:v,referenceString:o,resourceDestinationString:o,resourceTitleString:o,setextHeading:r(kh),strong:r(j0),thematicBreak:r(Q0)},exit:{atxHeading:u(),atxHeadingSequence:I,autolink:u(),autolinkEmail:yo,autolinkProtocol:ot,blockQuote:u(),characterEscapeValue:k,characterReferenceMarkerHexadecimal:cl,characterReferenceMarkerNumeric:cl,characterReferenceValue:Xc,characterReference:du,codeFenced:u(w),codeFencedFence:y,codeFencedFenceInfo:p,codeFencedFenceMeta:g,codeFlowValue:k,codeIndented:u(x),codeText:u(O),codeTextData:k,data:k,definition:u(),definitionDestinationString:L,definitionLabelString:m,definitionTitleString:h,emphasis:u(),hardBreakEscape:u(ne),hardBreakTrailing:u(ne),htmlFlow:u(z),htmlFlowData:k,htmlText:u(E),htmlTextData:k,image:u(Ee),label:qt,labelText:Nt,lineEnding:oe,link:u($),listItem:u(),listOrdered:u(),listUnordered:u(),paragraph:u(),referenceString:Ut,resourceDestinationString:b,resourceTitleString:wt,resource:Jt,setextHeading:u(N),setextHeadingLineSequence:T,setextHeadingText:C,strong:u(),thematicBreak:u()}};Ib(t,(e||{}).mdastExtensions||[]);let a={};return n;function n(D){let q={type:"root",children:[]},te={stack:[q],tokenStack:[],config:t,enter:i,exit:c,buffer:o,resume:s,data:a},de=[],ke=-1;for(;++ke<D.length;)if(D[ke][1].type==="listOrdered"||D[ke][1].type==="listUnordered")if(D[ke][0]==="enter")de.push(ke);else{let xa=de.pop();ke=l(D,xa,ke)}for(ke=-1;++ke<D.length;){let xa=t[D[ke][0]];wb.call(xa,D[ke][1].type)&&xa[D[ke][1].type].call(Object.assign({sliceSerialize:D[ke][2].sliceSerialize},te),D[ke][1])}if(te.tokenStack.length>0){let xa=te.tokenStack[te.tokenStack.length-1];(xa[1]||kb).call(te,void 0,xa[0])}for(q.position={start:ul(D.length>0?D[0][1].start:{line:1,column:1,offset:0}),end:ul(D.length>0?D[D.length-2][1].end:{line:1,column:1,offset:0})},ke=-1;++ke<t.transforms.length;)q=t.transforms[ke](q)||q;return q}function l(D,q,te){let de=q-1,ke=-1,xa=!1,dl,Ga,Lo,bo;for(;++de<=te;){let Pt=D[de];switch(Pt[1].type){case"listUnordered":case"listOrdered":case"blockQuote":{Pt[0]==="enter"?ke++:ke--,bo=void 0;break}case"lineEndingBlank":{Pt[0]==="enter"&&(dl&&!bo&&!ke&&!Lo&&(Lo=de),bo=void 0);break}case"linePrefix":case"listItemValue":case"listItemMarker":case"listItemPrefix":case"listItemPrefixWhitespace":break;default:bo=void 0}if(!ke&&Pt[0]==="enter"&&Pt[1].type==="listItemPrefix"||ke===-1&&Pt[0]==="exit"&&(Pt[1].type==="listUnordered"||Pt[1].type==="listOrdered")){if(dl){let ur=de;for(Ga=void 0;ur--;){let Va=D[ur];if(Va[1].type==="lineEnding"||Va[1].type==="lineEndingBlank"){if(Va[0]==="exit")continue;Ga&&(D[Ga][1].type="lineEndingBlank",xa=!0),Va[1].type="lineEnding",Ga=ur}else if(!(Va[1].type==="linePrefix"||Va[1].type==="blockQuotePrefix"||Va[1].type==="blockQuotePrefixWhitespace"||Va[1].type==="blockQuoteMarker"||Va[1].type==="listItemIndent"))break}Lo&&(!Ga||Lo<Ga)&&(dl._spread=!0),dl.end=Object.assign({},Ga?D[Ga][1].start:Pt[1].end),D.splice(Ga||de,0,["exit",dl,Pt[2]]),de++,te++}if(Pt[1].type==="listItemPrefix"){let ur={type:"listItem",_spread:!1,start:Object.assign({},Pt[1].start),end:void 0};dl=ur,D.splice(de,0,["enter",ur,Pt[2]]),de++,te++,Lo=void 0,bo=!0}}}return D[q][1]._spread=xa,te}function r(D,q){return te;function te(de){i.call(this,D(de),de),q&&q.call(this,de)}}function o(){this.stack.push({type:"fragment",children:[]})}function i(D,q,te){this.stack[this.stack.length-1].children.push(D),this.stack.push(D),this.tokenStack.push([q,te||void 0]),D.position={start:ul(q.start),end:void 0}}function u(D){return q;function q(te){D&&D.call(this,te),c.call(this,te)}}function c(D,q){let te=this.stack.pop(),de=this.tokenStack.pop();if(de)de[0].type!==D.type&&(q?q.call(this,D,de[0]):(de[1]||kb).call(this,D,de[0]));else throw new Error("Cannot close `"+D.type+"` ("+rl({start:D.start,end:D.end})+"): it\u2019s not open");te.position.end=ul(D.end)}function s(){return Yl(this.stack.pop())}function f(){this.data.expectingFirstListItemValue=!0}function d(D){if(this.data.expectingFirstListItemValue){let q=this.stack[this.stack.length-2];q.start=Number.parseInt(this.sliceSerialize(D),10),this.data.expectingFirstListItemValue=void 0}}function p(){let D=this.resume(),q=this.stack[this.stack.length-1];q.lang=D}function g(){let D=this.resume(),q=this.stack[this.stack.length-1];q.meta=D}function y(){this.data.flowCodeInside||(this.buffer(),this.data.flowCodeInside=!0)}function w(){let D=this.resume(),q=this.stack[this.stack.length-1];q.value=D.replace(/^(\r?\n|\r)|(\r?\n|\r)$/g,""),this.data.flowCodeInside=void 0}function x(){let D=this.resume(),q=this.stack[this.stack.length-1];q.value=D.replace(/(\r?\n|\r)$/g,"")}function m(D){let q=this.resume(),te=this.stack[this.stack.length-1];te.label=q,te.identifier=gt(this.sliceSerialize(D)).toLowerCase()}function h(){let D=this.resume(),q=this.stack[this.stack.length-1];q.title=D}function L(){let D=this.resume(),q=this.stack[this.stack.length-1];q.url=D}function I(D){let q=this.stack[this.stack.length-1];if(!q.depth){let te=this.sliceSerialize(D).length;q.depth=te}}function C(){this.data.setextHeadingSlurpLineEnding=!0}function T(D){let q=this.stack[this.stack.length-1];q.depth=this.sliceSerialize(D).codePointAt(0)===61?1:2}function N(){this.data.setextHeadingSlurpLineEnding=void 0}function P(D){let te=this.stack[this.stack.length-1].children,de=te[te.length-1];(!de||de.type!=="text")&&(de=X0(),de.position={start:ul(D.start),end:void 0},te.push(de)),this.stack.push(de)}function k(D){let q=this.stack.pop();q.value+=this.sliceSerialize(D),q.position.end=ul(D.end)}function oe(D){let q=this.stack[this.stack.length-1];if(this.data.atHardBreak){let te=q.children[q.children.length-1];te.position.end=ul(D.end),this.data.atHardBreak=void 0;return}!this.data.setextHeadingSlurpLineEnding&&t.canContainEols.includes(q.type)&&(P.call(this,D),k.call(this,D))}function ne(){this.data.atHardBreak=!0}function z(){let D=this.resume(),q=this.stack[this.stack.length-1];q.value=D}function E(){let D=this.resume(),q=this.stack[this.stack.length-1];q.value=D}function O(){let D=this.resume(),q=this.stack[this.stack.length-1];q.value=D}function $(){let D=this.stack[this.stack.length-1];if(this.data.inReference){let q=this.data.referenceType||"shortcut";D.type+="Reference",D.referenceType=q,delete D.url,delete D.title}else delete D.identifier,delete D.label;this.data.referenceType=void 0}function Ee(){let D=this.stack[this.stack.length-1];if(this.data.inReference){let q=this.data.referenceType||"shortcut";D.type+="Reference",D.referenceType=q,delete D.url,delete D.title}else delete D.identifier,delete D.label;this.data.referenceType=void 0}function Nt(D){let q=this.sliceSerialize(D),te=this.stack[this.stack.length-2];te.label=Sb(q),te.identifier=gt(q).toLowerCase()}function qt(){let D=this.stack[this.stack.length-1],q=this.resume(),te=this.stack[this.stack.length-1];if(this.data.inReference=!0,te.type==="link"){let de=D.children;te.children=de}else te.alt=q}function b(){let D=this.resume(),q=this.stack[this.stack.length-1];q.url=D}function wt(){let D=this.resume(),q=this.stack[this.stack.length-1];q.title=D}function Jt(){this.data.inReference=void 0}function v(){this.data.referenceType="collapsed"}function Ut(D){let q=this.resume(),te=this.stack[this.stack.length-1];te.label=q,te.identifier=gt(this.sliceSerialize(D)).toLowerCase(),this.data.referenceType="full"}function cl(D){this.data.characterReferenceType=D.type}function Xc(D){let q=this.sliceSerialize(D),te=this.data.characterReferenceType,de;te?(de=tc(q,te==="characterReferenceMarkerNumeric"?10:16),this.data.characterReferenceType=void 0):de=oo(q);let ke=this.stack[this.stack.length-1];ke.value+=de}function du(D){let q=this.stack.pop();q.position.end=ul(D.end)}function ot(D){k.call(this,D);let q=this.stack[this.stack.length-1];q.url=this.sliceSerialize(D)}function yo(D){k.call(this,D);let q=this.stack[this.stack.length-1];q.url="mailto:"+this.sliceSerialize(D)}function _a(){return{type:"blockquote",children:[]}}function fl(){return{type:"code",lang:null,meta:null,value:""}}function ir(){return{type:"inlineCode",value:""}}function Qc(){return{type:"definition",identifier:"",label:null,title:null,url:""}}function H0(){return{type:"emphasis",children:[]}}function kh(){return{type:"heading",depth:0,children:[]}}function wh(){return{type:"break"}}function Ih(){return{type:"html",value:""}}function _0(){return{type:"image",title:null,url:"",alt:null}}function Ah(){return{type:"link",title:null,url:"",children:[]}}function Th(D){return{type:"list",ordered:D.type==="listOrdered",start:null,spread:D._spread,children:[]}}function G0(D){return{type:"listItem",spread:D._spread,checked:null,children:[]}}function V0(){return{type:"paragraph",children:[]}}function j0(){return{type:"strong",children:[]}}function X0(){return{type:"text",value:""}}function Q0(){return{type:"thematicBreak"}}}function ul(e){return{line:e.line,column:e.column,offset:e.offset}}function Ib(e,t){let a=-1;for(;++a<t.length;){let n=t[a];Array.isArray(n)?Ib(e,n):wA(e,n)}}function wA(e,t){let a;for(a in t)if(wb.call(t,a))switch(a){case"canContainEols":{let n=t[a];n&&e[a].push(...n);break}case"transforms":{let n=t[a];n&&e[a].push(...n);break}case"enter":case"exit":{let n=t[a];n&&Object.assign(e[a],n);break}}}function kb(e,t){throw e?new Error("Cannot close `"+e.type+"` ("+rl({start:e.start,end:e.end})+"): a different token (`"+t.type+"`, "+rl({start:t.start,end:t.end})+") is open"):new Error("Cannot close document, a token (`"+t.type+"`, "+rl({start:t.start,end:t.end})+") is still open")}function dc(e){let t=this;t.parser=a;function a(n){return gm(n,{...t.data("settings"),...e,extensions:t.data("micromarkExtensions")||[],mdastExtensions:t.data("fromMarkdownExtensions")||[]})}}function Ab(e,t){let a={type:"element",tagName:"blockquote",properties:{},children:e.wrap(e.all(t),!0)};return e.patch(t,a),e.applyData(t,a)}function Tb(e,t){let a={type:"element",tagName:"br",properties:{},children:[]};return e.patch(t,a),[e.applyData(t,a),{type:"text",value:`
`}]}function Db(e,t){let a=t.value?t.value+`
`:"",n={},l=t.lang?t.lang.split(/\s+/):[];l.length>0&&(n.className=["language-"+l[0]]);let r={type:"element",tagName:"code",properties:n,children:[{type:"text",value:a}]};return t.meta&&(r.data={meta:t.meta}),e.patch(t,r),r=e.applyData(t,r),r={type:"element",tagName:"pre",properties:{},children:[r]},e.patch(t,r),r}function Mb(e,t){let a={type:"element",tagName:"del",properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function Eb(e,t){let a={type:"element",tagName:"em",properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function zb(e,t){let a=typeof e.options.clobberPrefix=="string"?e.options.clobberPrefix:"user-content-",n=String(t.identifier).toUpperCase(),l=ga(n.toLowerCase()),r=e.footnoteOrder.indexOf(n),o,i=e.footnoteCounts.get(n);i===void 0?(i=0,e.footnoteOrder.push(n),o=e.footnoteOrder.length):o=r+1,i+=1,e.footnoteCounts.set(n,i);let u={type:"element",tagName:"a",properties:{href:"#"+a+"fn-"+l,id:a+"fnref-"+l+(i>1?"-"+i:""),dataFootnoteRef:!0,ariaDescribedBy:["footnote-label"]},children:[{type:"text",value:String(o)}]};e.patch(t,u);let c={type:"element",tagName:"sup",properties:{},children:[u]};return e.patch(t,c),e.applyData(t,c)}function Bb(e,t){let a={type:"element",tagName:"h"+t.depth,properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function Rb(e,t){if(e.options.allowDangerousHtml){let a={type:"raw",value:t.value};return e.patch(t,a),e.applyData(t,a)}}function pc(e,t){let a=t.referenceType,n="]";if(a==="collapsed"?n+="[]":a==="full"&&(n+="["+(t.label||t.identifier)+"]"),t.type==="imageReference")return[{type:"text",value:"!["+t.alt+n}];let l=e.all(t),r=l[0];r&&r.type==="text"?r.value="["+r.value:l.unshift({type:"text",value:"["});let o=l[l.length-1];return o&&o.type==="text"?o.value+=n:l.push({type:"text",value:n}),l}function Ob(e,t){let a=String(t.identifier).toUpperCase(),n=e.definitionById.get(a);if(!n)return pc(e,t);let l={src:ga(n.url||""),alt:t.alt};n.title!==null&&n.title!==void 0&&(l.title=n.title);let r={type:"element",tagName:"img",properties:l,children:[]};return e.patch(t,r),e.applyData(t,r)}function Nb(e,t){let a={src:ga(t.url)};t.alt!==null&&t.alt!==void 0&&(a.alt=t.alt),t.title!==null&&t.title!==void 0&&(a.title=t.title);let n={type:"element",tagName:"img",properties:a,children:[]};return e.patch(t,n),e.applyData(t,n)}function qb(e,t){let a={type:"text",value:t.value.replace(/\r?\n|\r/g," ")};e.patch(t,a);let n={type:"element",tagName:"code",properties:{},children:[a]};return e.patch(t,n),e.applyData(t,n)}function Ub(e,t){let a=String(t.identifier).toUpperCase(),n=e.definitionById.get(a);if(!n)return pc(e,t);let l={href:ga(n.url||"")};n.title!==null&&n.title!==void 0&&(l.title=n.title);let r={type:"element",tagName:"a",properties:l,children:e.all(t)};return e.patch(t,r),e.applyData(t,r)}function Pb(e,t){let a={href:ga(t.url)};t.title!==null&&t.title!==void 0&&(a.title=t.title);let n={type:"element",tagName:"a",properties:a,children:e.all(t)};return e.patch(t,n),e.applyData(t,n)}function Fb(e,t,a){let n=e.all(t),l=a?IA(a):Hb(t),r={},o=[];if(typeof t.checked=="boolean"){let s=n[0],f;s&&s.type==="element"&&s.tagName==="p"?f=s:(f={type:"element",tagName:"p",properties:{},children:[]},n.unshift(f)),f.children.length>0&&f.children.unshift({type:"text",value:" "}),f.children.unshift({type:"element",tagName:"input",properties:{type:"checkbox",checked:t.checked,disabled:!0},children:[]}),r.className=["task-list-item"]}let i=-1;for(;++i<n.length;){let s=n[i];(l||i!==0||s.type!=="element"||s.tagName!=="p")&&o.push({type:"text",value:`
`}),s.type==="element"&&s.tagName==="p"&&!l?o.push(...s.children):o.push(s)}let u=n[n.length-1];u&&(l||u.type!=="element"||u.tagName!=="p")&&o.push({type:"text",value:`
`});let c={type:"element",tagName:"li",properties:r,children:o};return e.patch(t,c),e.applyData(t,c)}function IA(e){let t=!1;if(e.type==="list"){t=e.spread||!1;let a=e.children,n=-1;for(;!t&&++n<a.length;)t=Hb(a[n])}return t}function Hb(e){let t=e.spread;return t??e.children.length>1}function _b(e,t){let a={},n=e.all(t),l=-1;for(typeof t.start=="number"&&t.start!==1&&(a.start=t.start);++l<n.length;){let o=n[l];if(o.type==="element"&&o.tagName==="li"&&o.properties&&Array.isArray(o.properties.className)&&o.properties.className.includes("task-list-item")){a.className=["contains-task-list"];break}}let r={type:"element",tagName:t.ordered?"ol":"ul",properties:a,children:e.wrap(n,!0)};return e.patch(t,r),e.applyData(t,r)}function Gb(e,t){let a={type:"element",tagName:"p",properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function Vb(e,t){let a={type:"root",children:e.wrap(e.all(t))};return e.patch(t,a),e.applyData(t,a)}function jb(e,t){let a={type:"element",tagName:"strong",properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function Xb(e,t){let a=e.all(t),n=a.shift(),l=[];if(n){let o={type:"element",tagName:"thead",properties:{},children:e.wrap([n],!0)};e.patch(t.children[0],o),l.push(o)}if(a.length>0){let o={type:"element",tagName:"tbody",properties:{},children:e.wrap(a,!0)},i=ro(t.children[1]),u=$s(t.children[t.children.length-1]);i&&u&&(o.position={start:i,end:u}),l.push(o)}let r={type:"element",tagName:"table",properties:{},children:e.wrap(l,!0)};return e.patch(t,r),e.applyData(t,r)}function Qb(e,t,a){let n=a?a.children:void 0,r=(n?n.indexOf(t):1)===0?"th":"td",o=a&&a.type==="table"?a.align:void 0,i=o?o.length:t.children.length,u=-1,c=[];for(;++u<i;){let f=t.children[u],d={},p=o?o[u]:void 0;p&&(d.align=p);let g={type:"element",tagName:r,properties:d,children:[]};f&&(g.children=e.all(f),e.patch(f,g),g=e.applyData(f,g)),c.push(g)}let s={type:"element",tagName:"tr",properties:{},children:e.wrap(c,!0)};return e.patch(t,s),e.applyData(t,s)}function Yb(e,t){let a={type:"element",tagName:"td",properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function Zb(e){let t=String(e),a=/\r?\n|\r/g,n=a.exec(t),l=0,r=[];for(;n;)r.push(Kb(t.slice(l,n.index),l>0,!0),n[0]),l=n.index+n[0].length,n=a.exec(t);return r.push(Kb(t.slice(l),l>0,!1)),r.join("")}function Kb(e,t,a){let n=0,l=e.length;if(t){let r=e.codePointAt(n);for(;r===9||r===32;)n++,r=e.codePointAt(n)}if(a){let r=e.codePointAt(l-1);for(;r===9||r===32;)l--,r=e.codePointAt(l-1)}return l>n?e.slice(n,l):""}function Jb(e,t){let a={type:"text",value:Zb(String(t.value))};return e.patch(t,a),e.applyData(t,a)}function Wb(e,t){let a={type:"element",tagName:"hr",properties:{},children:[]};return e.patch(t,a),e.applyData(t,a)}var $b={blockquote:Ab,break:Tb,code:Db,delete:Mb,emphasis:Eb,footnoteReference:zb,heading:Bb,html:Rb,imageReference:Ob,image:Nb,inlineCode:qb,linkReference:Ub,link:Pb,listItem:Fb,list:_b,paragraph:Gb,root:Vb,strong:jb,table:Xb,tableCell:Yb,tableRow:Qb,text:Jb,thematicBreak:Wb,toml:mc,yaml:mc,definition:mc,footnoteDefinition:mc};function mc(){}var{defineProperty:MA}=Object,rv=typeof self=="object"?self:globalThis,ev=(e,t)=>{switch(e){case"Function":case"SharedWorker":case"Worker":case"eval":case"setInterval":case"setTimeout":throw new TypeError("unable to deserialize "+e)}return new rv[e](t)},EA=(e,t)=>{let a=(l,r)=>(e.set(r,l),l),n=l=>{if(e.has(l))return e.get(l);let[r,o]=t[l];switch(r){case 0:case-1:return a(o,l);case 1:{let i=a([],l);for(let u of o)i.push(n(u));return i}case 2:{let i=a({},l);for(let[u,c]of o){let s=n(u),f=n(c);s==="__proto__"?MA(i,s,{value:f,configurable:!0,enumerable:!0,writable:!0}):i[s]=f}return i}case 3:return a(new Date(o),l);case 4:{let{source:i,flags:u}=o;return a(new RegExp(i,u),l)}case 5:{let i=a(new Map,l);for(let[u,c]of o)i.set(n(u),n(c));return i}case 6:{let i=a(new Set,l);for(let u of o)i.add(n(u));return i}case 7:{let{name:i,message:u}=o;return a(typeof rv[i]=="function"?ev(i,u):new Error(u),l)}case 8:return a(BigInt(o),l);case"BigInt":return a(Object(BigInt(o)),l);case"ArrayBuffer":return a(new Uint8Array(o).buffer,o);case"DataView":{let{buffer:i}=new Uint8Array(o);return a(new DataView(i),o)}case"-0":return-0}return a(ev(r,o),l)};return n},Lm=e=>EA(new Map,e)(0);var er="",{toString:zA}={},{keys:BA,is:RA}=Object,au=e=>{let t=typeof e;if(t!=="object"||!e)return[0,t];let a=zA.call(e).slice(8,-1);switch(a){case"Array":return[1,er];case"Object":return[2,er];case"Date":return[3,er];case"RegExp":return[4,er];case"Map":return[5,er];case"Set":return[6,er];case"DataView":return[1,a]}return a.includes("Array")?[1,a]:e instanceof Error?[7,e.name||"Error"]:[2,a]},gc=([e,t])=>e===0&&(t==="function"||t==="symbol"),OA=(e,t,a,n)=>{let l=(o,i)=>{let u=n.push(o)-1;return a.set(i,u),u},r=o=>{if(a.has(o))return a.get(o);let[i,u]=au(o);switch(i){case 0:{let s=o;switch(u){case"bigint":i=8,s=o.toString();break;case"number":if(!o&&RA(o,-0))return n.push(["-0"])-1;break;case"function":case"symbol":if(e)throw new TypeError("unable to serialize "+u);s=null;break;case"undefined":return l([-1],o)}return l([i,s],o)}case 1:{if(u){let d=o;return u==="DataView"?d=new Uint8Array(o.buffer):u==="ArrayBuffer"&&(d=new Uint8Array(o)),l([u,[...d]],o)}let s=[],f=l([i,s],o);for(let d of o)s.push(r(d));return f}case 2:{if(u)switch(u){case"BigInt":return l([u,o.toString()],o);case"Boolean":case"Number":case"String":return l([u,o.valueOf()],o)}if(t&&"toJSON"in o)return r(o.toJSON());let s=[],f=l([i,s],o);for(let d of BA(o))(e||!gc(au(o[d])))&&s.push([r(d),r(o[d])]);return f}case 3:return l([i,isNaN(o.getTime())?er:o.toISOString()],o);case 4:{let{source:s,flags:f}=o;return l([i,{source:s,flags:f}],o)}case 5:{let s=[],f=l([i,s],o);for(let[d,p]of o)(e||!(gc(au(d))||gc(au(p))))&&s.push([r(d),r(p)]);return f}case 6:{let s=[],f=l([i,s],o);for(let d of o)(e||!gc(au(d)))&&s.push(r(d));return f}}let{message:c}=o;return l([i,{name:u,message:c}],o)};return r},bm=(e,{json:t,lossy:a}={})=>{let n=[];return OA(!(t||a),!!t,new Map,n)(e),n};var uo=typeof structuredClone=="function"?(e,t)=>t&&("json"in t||"lossy"in t)?Lm(bm(e,t)):structuredClone(e):(e,t)=>Lm(bm(e,t));function NA(e,t){let a=[{type:"text",value:"\u21A9"}];return t>1&&a.push({type:"element",tagName:"sup",properties:{},children:[{type:"text",value:String(t)}]}),a}function qA(e,t){return"Back to reference "+(e+1)+(t>1?"-"+t:"")}function ov(e){let t=typeof e.options.clobberPrefix=="string"?e.options.clobberPrefix:"user-content-",a=e.options.footnoteBackContent||NA,n=e.options.footnoteBackLabel||qA,l=e.options.footnoteLabel||"Footnotes",r=e.options.footnoteLabelTagName||"h2",o=e.options.footnoteLabelProperties||{className:["sr-only"]},i=[],u=-1;for(;++u<e.footnoteOrder.length;){let c=e.footnoteById.get(e.footnoteOrder[u]);if(!c)continue;let s=e.all(c),f=String(c.identifier).toUpperCase(),d=ga(f.toLowerCase()),p=0,g=[],y=e.footnoteCounts.get(f);for(;y!==void 0&&++p<=y;){g.length>0&&g.push({type:"text",value:" "});let m=typeof a=="string"?a:a(u,p);typeof m=="string"&&(m={type:"text",value:m}),g.push({type:"element",tagName:"a",properties:{href:"#"+t+"fnref-"+d+(p>1?"-"+p:""),dataFootnoteBackref:"",ariaLabel:typeof n=="string"?n:n(u,p),className:["data-footnote-backref"]},children:Array.isArray(m)?m:[m]})}let w=s[s.length-1];if(w&&w.type==="element"&&w.tagName==="p"){let m=w.children[w.children.length-1];m&&m.type==="text"?m.value+=" ":w.children.push({type:"text",value:" "}),w.children.push(...g)}else s.push(...g);let x={type:"element",tagName:"li",properties:{id:t+"fn-"+d},children:e.wrap(s,!0)};e.patch(c,x),i.push(x)}if(i.length!==0)return{type:"element",tagName:"section",properties:{dataFootnotes:!0,className:["footnotes"]},children:[{type:"element",tagName:r,properties:{...uo(o),id:"footnote-label"},children:[{type:"text",value:l}]},{type:"text",value:`
`},{type:"element",tagName:"ol",properties:{},children:e.wrap(i,!0)},{type:"text",value:`
`}]}}var sl=(function(e){if(e==null)return HA;if(typeof e=="function")return xc(e);if(typeof e=="object")return Array.isArray(e)?UA(e):PA(e);if(typeof e=="string")return FA(e);throw new Error("Expected function, string, or object as test")});function UA(e){let t=[],a=-1;for(;++a<e.length;)t[a]=sl(e[a]);return xc(n);function n(...l){let r=-1;for(;++r<t.length;)if(t[r].apply(this,l))return!0;return!1}}function PA(e){let t=e;return xc(a);function a(n){let l=n,r;for(r in e)if(l[r]!==t[r])return!1;return!0}}function FA(e){return xc(t);function t(a){return a&&a.type===e}}function xc(e){return t;function t(a,n,l){return!!(_A(a)&&e.call(this,a,typeof n=="number"?n:void 0,l||void 0))}}function HA(){return!0}function _A(e){return e!==null&&typeof e=="object"&&"type"in e}var iv=[],yc=!0,tr=!1,Lc="skip";function nu(e,t,a,n){let l;typeof t=="function"&&typeof a!="function"?(n=a,a=t):l=t;let r=sl(l),o=n?-1:1;i(e,void 0,[])();function i(u,c,s){let f=u&&typeof u=="object"?u:{};if(typeof f.type=="string"){let p=typeof f.tagName=="string"?f.tagName:typeof f.name=="string"?f.name:void 0;Object.defineProperty(d,"name",{value:"node ("+(u.type+(p?"<"+p+">":""))+")"})}return d;function d(){let p=iv,g,y,w;if((!t||r(u,c,s[s.length-1]||void 0))&&(p=GA(a(u,s)),p[0]===tr))return p;if("children"in u&&u.children){let x=u;if(x.children&&p[0]!==Lc)for(y=(n?x.children.length:-1)+o,w=s.concat(x);y>-1&&y<x.children.length;){let m=x.children[y];if(g=i(m,y,w)(),g[0]===tr)return g;y=typeof g[1]=="number"?g[1]:y+o}}return p}}}function GA(e){return Array.isArray(e)?e:typeof e=="number"?[yc,e]:e==null?iv:[e]}function ar(e,t,a,n){let l,r,o;typeof t=="function"&&typeof a!="function"?(r=void 0,o=t,l=a):(r=t,o=a,l=n),nu(e,r,i,l);function i(u,c){let s=c[c.length-1],f=s?s.children.indexOf(u):void 0;return o(u,f,s)}}var vm={}.hasOwnProperty,VA={};function sv(e,t){let a=t||VA,n=new Map,l=new Map,r=new Map,o={...$b,...a.handlers},i={all:c,applyData:XA,definitionById:n,footnoteById:l,footnoteCounts:r,footnoteOrder:[],handlers:o,one:u,options:a,patch:jA,wrap:YA};return ar(e,function(s){if(s.type==="definition"||s.type==="footnoteDefinition"){let f=s.type==="definition"?n:l,d=String(s.identifier).toUpperCase();f.has(d)||f.set(d,s)}}),i;function u(s,f){let d=s.type,p=i.handlers[d];if(vm.call(i.handlers,d)&&p)return p(i,s,f);if(i.options.passThrough&&i.options.passThrough.includes(d)){if("children"in s){let{children:y,...w}=s,x=uo(w);return x.children=i.all(s),x}return uo(s)}return(i.options.unknownHandler||QA)(i,s,f)}function c(s){let f=[];if("children"in s){let d=s.children,p=-1;for(;++p<d.length;){let g=i.one(d[p],s);if(g){if(p&&d[p-1].type==="break"&&(!Array.isArray(g)&&g.type==="text"&&(g.value=uv(g.value)),!Array.isArray(g)&&g.type==="element")){let y=g.children[0];y&&y.type==="text"&&(y.value=uv(y.value))}Array.isArray(g)?f.push(...g):f.push(g)}}}return f}}function jA(e,t){e.position&&(t.position=Yp(e))}function XA(e,t){let a=t;if(e&&e.data){let n=e.data.hName,l=e.data.hChildren,r=e.data.hProperties;if(typeof n=="string")if(a.type==="element")a.tagName=n;else{let o="children"in a?a.children:[a];a={type:"element",tagName:n,properties:{},children:o}}a.type==="element"&&r&&Object.assign(a.properties,uo(r)),"children"in a&&a.children&&l!==null&&l!==void 0&&(a.children=l)}return a}function QA(e,t){let a=t.data||{},n="value"in t&&!(vm.call(a,"hProperties")||vm.call(a,"hChildren"))?{type:"text",value:t.value}:{type:"element",tagName:"div",properties:{},children:e.all(t)};return e.patch(t,n),e.applyData(t,n)}function YA(e,t){let a=[],n=-1;for(t&&a.push({type:"text",value:`
`});++n<e.length;)n&&a.push({type:"text",value:`
`}),a.push(e[n]);return t&&e.length>0&&a.push({type:"text",value:`
`}),a}function uv(e){let t=0,a=e.charCodeAt(t);for(;a===9||a===32;)t++,a=e.charCodeAt(t);return e.slice(t)}function bc(e,t){let a=sv(e,t),n=a.one(e,void 0),l=ov(a),r=Array.isArray(n)?{type:"root",children:n}:n||{type:"root",children:[]};return l&&("children"in r,r.children.push({type:"text",value:`
`},l)),r}function vc(e,t){return e&&"run"in e?async function(a,n){let l=bc(a,{file:n,...t});await e.run(l,n)}:function(a,n){return bc(a,{file:n,...e||t})}}function Cm(e){if(e)throw e}var kc=J(yv(),1);function lu(e){if(typeof e!="object"||e===null)return!1;let t=Object.getPrototypeOf(e);return(t===null||t===Object.prototype||Object.getPrototypeOf(t)===null)&&!(Symbol.toStringTag in e)&&!(Symbol.iterator in e)}function Sm(){let e=[],t={run:a,use:n};return t;function a(...l){let r=-1,o=l.pop();if(typeof o!="function")throw new TypeError("Expected function as last argument, not "+o);i(null,...l);function i(u,...c){let s=e[++r],f=-1;if(u){o(u);return}for(;++f<l.length;)(c[f]===null||c[f]===void 0)&&(c[f]=l[f]);l=c,s?Lv(s,i)(...c):o(null,...c)}}function n(l){if(typeof l!="function")throw new TypeError("Expected `middelware` to be a function, not "+l);return e.push(l),t}}function Lv(e,t){let a;return n;function n(...o){let i=e.length>o.length,u;i&&o.push(l);try{u=e.apply(this,o)}catch(c){let s=c;if(i&&a)throw s;return l(s)}i||(u&&u.then&&typeof u.then=="function"?u.then(r,l):u instanceof Error?l(u):r(u))}function l(o,...i){a||(a=!0,t(o,...i))}function r(o){l(null,o)}}var Ca={basename:KA,dirname:ZA,extname:JA,join:WA,sep:"/"};function KA(e,t){if(t!==void 0&&typeof t!="string")throw new TypeError('"ext" argument must be a string');ru(e);let a=0,n=-1,l=e.length,r;if(t===void 0||t.length===0||t.length>e.length){for(;l--;)if(e.codePointAt(l)===47){if(r){a=l+1;break}}else n<0&&(r=!0,n=l+1);return n<0?"":e.slice(a,n)}if(t===e)return"";let o=-1,i=t.length-1;for(;l--;)if(e.codePointAt(l)===47){if(r){a=l+1;break}}else o<0&&(r=!0,o=l+1),i>-1&&(e.codePointAt(l)===t.codePointAt(i--)?i<0&&(n=l):(i=-1,n=o));return a===n?n=o:n<0&&(n=e.length),e.slice(a,n)}function ZA(e){if(ru(e),e.length===0)return".";let t=-1,a=e.length,n;for(;--a;)if(e.codePointAt(a)===47){if(n){t=a;break}}else n||(n=!0);return t<0?e.codePointAt(0)===47?"/":".":t===1&&e.codePointAt(0)===47?"//":e.slice(0,t)}function JA(e){ru(e);let t=e.length,a=-1,n=0,l=-1,r=0,o;for(;t--;){let i=e.codePointAt(t);if(i===47){if(o){n=t+1;break}continue}a<0&&(o=!0,a=t+1),i===46?l<0?l=t:r!==1&&(r=1):l>-1&&(r=-1)}return l<0||a<0||r===0||r===1&&l===a-1&&l===n+1?"":e.slice(l,a)}function WA(...e){let t=-1,a;for(;++t<e.length;)ru(e[t]),e[t]&&(a=a===void 0?e[t]:a+"/"+e[t]);return a===void 0?".":$A(a)}function $A(e){ru(e);let t=e.codePointAt(0)===47,a=eT(e,!t);return a.length===0&&!t&&(a="."),a.length>0&&e.codePointAt(e.length-1)===47&&(a+="/"),t?"/"+a:a}function eT(e,t){let a="",n=0,l=-1,r=0,o=-1,i,u;for(;++o<=e.length;){if(o<e.length)i=e.codePointAt(o);else{if(i===47)break;i=47}if(i===47){if(!(l===o-1||r===1))if(l!==o-1&&r===2){if(a.length<2||n!==2||a.codePointAt(a.length-1)!==46||a.codePointAt(a.length-2)!==46){if(a.length>2){if(u=a.lastIndexOf("/"),u!==a.length-1){u<0?(a="",n=0):(a=a.slice(0,u),n=a.length-1-a.lastIndexOf("/")),l=o,r=0;continue}}else if(a.length>0){a="",n=0,l=o,r=0;continue}}t&&(a=a.length>0?a+"/..":"..",n=2)}else a.length>0?a+="/"+e.slice(l+1,o):a=e.slice(l+1,o),n=o-l-1;l=o,r=0}else i===46&&r>-1?r++:r=-1}return a}function ru(e){if(typeof e!="string")throw new TypeError("Path must be a string. Received "+JSON.stringify(e))}var bv={cwd:tT};function tT(){return"/"}function so(e){return!!(e!==null&&typeof e=="object"&&"href"in e&&e.href&&"protocol"in e&&e.protocol&&e.auth===void 0)}function vv(e){if(typeof e=="string")e=new URL(e);else if(!so(e)){let t=new TypeError('The "path" argument must be of type string or an instance of URL. Received `'+e+"`");throw t.code="ERR_INVALID_ARG_TYPE",t}if(e.protocol!=="file:"){let t=new TypeError("The URL must be of scheme file");throw t.code="ERR_INVALID_URL_SCHEME",t}return aT(e)}function aT(e){if(e.hostname!==""){let n=new TypeError('File URL host must be "localhost" or empty on darwin');throw n.code="ERR_INVALID_FILE_URL_HOST",n}let t=e.pathname,a=-1;for(;++a<t.length;)if(t.codePointAt(a)===37&&t.codePointAt(a+1)===50){let n=t.codePointAt(a+2);if(n===70||n===102){let l=new TypeError("File URL path must not include encoded / characters");throw l.code="ERR_INVALID_FILE_URL_PATH",l}}return decodeURIComponent(t)}var km=["history","path","basename","stem","extname","dirname"],nr=class{constructor(t){let a;t?so(t)?a={path:t}:typeof t=="string"||nT(t)?a={value:t}:a=t:a={},this.cwd="cwd"in a?"":bv.cwd(),this.data={},this.history=[],this.messages=[],this.value,this.map,this.result,this.stored;let n=-1;for(;++n<km.length;){let r=km[n];r in a&&a[r]!==void 0&&a[r]!==null&&(this[r]=r==="history"?[...a[r]]:a[r])}let l;for(l in a)km.includes(l)||(this[l]=a[l])}get basename(){return typeof this.path=="string"?Ca.basename(this.path):void 0}set basename(t){Im(t,"basename"),wm(t,"basename"),this.path=Ca.join(this.dirname||"",t)}get dirname(){return typeof this.path=="string"?Ca.dirname(this.path):void 0}set dirname(t){Cv(this.basename,"dirname"),this.path=Ca.join(t||"",this.basename)}get extname(){return typeof this.path=="string"?Ca.extname(this.path):void 0}set extname(t){if(wm(t,"extname"),Cv(this.dirname,"extname"),t){if(t.codePointAt(0)!==46)throw new Error("`extname` must start with `.`");if(t.includes(".",1))throw new Error("`extname` cannot contain multiple dots")}this.path=Ca.join(this.dirname,this.stem+(t||""))}get path(){return this.history[this.history.length-1]}set path(t){so(t)&&(t=vv(t)),Im(t,"path"),this.path!==t&&this.history.push(t)}get stem(){return typeof this.path=="string"?Ca.basename(this.path,this.extname):void 0}set stem(t){Im(t,"stem"),wm(t,"stem"),this.path=Ca.join(this.dirname||"",t+(this.extname||""))}fail(t,a,n){let l=this.message(t,a,n);throw l.fatal=!0,l}info(t,a,n){let l=this.message(t,a,n);return l.fatal=void 0,l}message(t,a,n){let l=new Ve(t,a,n);return this.path&&(l.name=this.path+":"+l.name,l.file=this.path),l.fatal=!1,this.messages.push(l),l}toString(t){return this.value===void 0?"":typeof this.value=="string"?this.value:new TextDecoder(t||void 0).decode(this.value)}};function wm(e,t){if(e&&e.includes(Ca.sep))throw new Error("`"+t+"` cannot be a path: did not expect `"+Ca.sep+"`")}function Im(e,t){if(!e)throw new Error("`"+t+"` cannot be empty")}function Cv(e,t){if(!e)throw new Error("Setting `"+t+"` requires `path` to be set too")}function nT(e){return!!(e&&typeof e=="object"&&"byteLength"in e&&"byteOffset"in e)}var Sv=(function(e){let n=this.constructor.prototype,l=n[e],r=function(){return l.apply(r,arguments)};return Object.setPrototypeOf(r,n),r});var lT={}.hasOwnProperty,Mm=class e extends Sv{constructor(){super("copy"),this.Compiler=void 0,this.Parser=void 0,this.attachers=[],this.compiler=void 0,this.freezeIndex=-1,this.frozen=void 0,this.namespace={},this.parser=void 0,this.transformers=Sm()}copy(){let t=new e,a=-1;for(;++a<this.attachers.length;){let n=this.attachers[a];t.use(...n)}return t.data((0,kc.default)(!0,{},this.namespace)),t}data(t,a){return typeof t=="string"?arguments.length===2?(Dm("data",this.frozen),this.namespace[t]=a,this):lT.call(this.namespace,t)&&this.namespace[t]||void 0:t?(Dm("data",this.frozen),this.namespace=t,this):this.namespace}freeze(){if(this.frozen)return this;let t=this;for(;++this.freezeIndex<this.attachers.length;){let[a,...n]=this.attachers[this.freezeIndex];if(n[0]===!1)continue;n[0]===!0&&(n[0]=void 0);let l=a.call(t,...n);typeof l=="function"&&this.transformers.use(l)}return this.frozen=!0,this.freezeIndex=Number.POSITIVE_INFINITY,this}parse(t){this.freeze();let a=Sc(t),n=this.parser||this.Parser;return Am("parse",n),n(String(a),a)}process(t,a){let n=this;return this.freeze(),Am("process",this.parser||this.Parser),Tm("process",this.compiler||this.Compiler),a?l(void 0,a):new Promise(l);function l(r,o){let i=Sc(t),u=n.parse(i);n.run(u,i,function(s,f,d){if(s||!f||!d)return c(s);let p=f,g=n.stringify(p,d);oT(g)?d.value=g:d.result=g,c(s,d)});function c(s,f){s||!f?o(s):r?r(f):a(void 0,f)}}}processSync(t){let a=!1,n;return this.freeze(),Am("processSync",this.parser||this.Parser),Tm("processSync",this.compiler||this.Compiler),this.process(t,l),wv("processSync","process",a),n;function l(r,o){a=!0,Cm(r),n=o}}run(t,a,n){kv(t),this.freeze();let l=this.transformers;return!n&&typeof a=="function"&&(n=a,a=void 0),n?r(void 0,n):new Promise(r);function r(o,i){let u=Sc(a);l.run(t,u,c);function c(s,f,d){let p=f||t;s?i(s):o?o(p):n(void 0,p,d)}}}runSync(t,a){let n=!1,l;return this.run(t,a,r),wv("runSync","run",n),l;function r(o,i){Cm(o),l=i,n=!0}}stringify(t,a){this.freeze();let n=Sc(a),l=this.compiler||this.Compiler;return Tm("stringify",l),kv(t),l(t,n)}use(t,...a){let n=this.attachers,l=this.namespace;if(Dm("use",this.frozen),t!=null)if(typeof t=="function")u(t,a);else if(typeof t=="object")Array.isArray(t)?i(t):o(t);else throw new TypeError("Expected usable value, not `"+t+"`");return this;function r(c){if(typeof c=="function")u(c,[]);else if(typeof c=="object")if(Array.isArray(c)){let[s,...f]=c;u(s,f)}else o(c);else throw new TypeError("Expected usable value, not `"+c+"`")}function o(c){if(!("plugins"in c)&&!("settings"in c))throw new Error("Expected usable value but received an empty preset, which is probably a mistake: presets typically come with `plugins` and sometimes with `settings`, but this has neither");i(c.plugins),c.settings&&(l.settings=(0,kc.default)(!0,l.settings,c.settings))}function i(c){let s=-1;if(c!=null)if(Array.isArray(c))for(;++s<c.length;){let f=c[s];r(f)}else throw new TypeError("Expected a list of plugins, not `"+c+"`")}function u(c,s){let f=-1,d=-1;for(;++f<n.length;)if(n[f][0]===c){d=f;break}if(d===-1)n.push([c,...s]);else if(s.length>0){let[p,...g]=s,y=n[d][1];lu(y)&&lu(p)&&(p=(0,kc.default)(!0,y,p)),n[d]=[c,p,...g]}}}},Em=new Mm().freeze();function Am(e,t){if(typeof t!="function")throw new TypeError("Cannot `"+e+"` without `parser`")}function Tm(e,t){if(typeof t!="function")throw new TypeError("Cannot `"+e+"` without `compiler`")}function Dm(e,t){if(t)throw new Error("Cannot call `"+e+"` on a frozen processor.\nCreate a new processor first, by calling it: use `processor()` instead of `processor`.")}function kv(e){if(!lu(e)||typeof e.type!="string")throw new TypeError("Expected node, got `"+e+"`")}function wv(e,t,a){if(!a)throw new Error("`"+e+"` finished async. Use `"+t+"` instead")}function Sc(e){return rT(e)?e:new nr(e)}function rT(e){return!!(e&&typeof e=="object"&&"message"in e&&"messages"in e)}function oT(e){return typeof e=="string"||iT(e)}function iT(e){return!!(e&&typeof e=="object"&&"byteLength"in e&&"byteOffset"in e)}var uT="https://github.com/remarkjs/react-markdown/blob/main/changelog.md",Iv=[],Av={allowDangerousHtml:!0},sT=/^(https?|ircs?|mailto|xmpp)$/i,cT=[{from:"astPlugins",id:"remove-buggy-html-in-markdown-parser"},{from:"allowDangerousHtml",id:"remove-buggy-html-in-markdown-parser"},{from:"allowNode",id:"replace-allownode-allowedtypes-and-disallowedtypes",to:"allowElement"},{from:"allowedTypes",id:"replace-allownode-allowedtypes-and-disallowedtypes",to:"allowedElements"},{from:"className",id:"remove-classname"},{from:"disallowedTypes",id:"replace-allownode-allowedtypes-and-disallowedtypes",to:"disallowedElements"},{from:"escapeHtml",id:"remove-buggy-html-in-markdown-parser"},{from:"includeElementIndex",id:"#remove-includeelementindex"},{from:"includeNodeIndex",id:"change-includenodeindex-to-includeelementindex"},{from:"linkTarget",id:"remove-linktarget"},{from:"plugins",id:"change-plugins-to-remarkplugins",to:"remarkPlugins"},{from:"rawSourcePos",id:"#remove-rawsourcepos"},{from:"renderers",id:"change-renderers-to-components",to:"components"},{from:"source",id:"change-source-to-children",to:"children"},{from:"sourcePos",id:"#remove-sourcepos"},{from:"transformImageUri",id:"#add-urltransform",to:"urlTransform"},{from:"transformLinkUri",id:"#add-urltransform",to:"urlTransform"}];function ou(e){let t=fT(e),a=dT(e);return pT(t.runSync(t.parse(a),a),e)}function fT(e){let t=e.rehypePlugins||Iv,a=e.remarkPlugins||Iv,n=e.remarkRehypeOptions?{...e.remarkRehypeOptions,...Av}:Av;return Em().use(dc).use(a).use(vc,n).use(t)}function dT(e){let t=e.children||"",a=new nr;return typeof t=="string"?a.value=t:(""+t,void 0),a}function pT(e,t){let a=t.allowedElements,n=t.allowElement,l=t.components,r=t.disallowedElements,o=t.skipHtml,i=t.unwrapDisallowed,u=t.urlTransform||Dv;for(let s of cT)Object.hasOwn(t,s.from)&&(""+s.from+(s.to?"use `"+s.to+"` instead":"remove it")+uT+s.id,void 0);return a&&r&&void 0,ar(e,c),Jp(e,{Fragment:co.Fragment,components:l,ignoreInvalidStyle:!0,jsx:co.jsx,jsxs:co.jsxs,passKeys:!0,passNode:!0});function c(s,f,d){if(s.type==="raw"&&d&&typeof f=="number")return o?d.children.splice(f,1):d.children[f]={type:"text",value:s.value},f;if(s.type==="element"){let p;for(p in Ki)if(Object.hasOwn(Ki,p)&&Object.hasOwn(s.properties,p)){let g=s.properties[p],y=Ki[p];(y===null||y.includes(s.tagName))&&(s.properties[p]=u(String(g||""),p,s))}}if(s.type==="element"){let p=a?!a.includes(s.tagName):r?r.includes(s.tagName):!1;if(!p&&n&&typeof f=="number"&&(p=!n(s,f,d)),p&&d&&typeof f=="number")return i&&s.children?d.children.splice(f,1,...s.children):d.children.splice(f,1),f}}}function Dv(e){let t=e.indexOf(":"),a=e.indexOf("?"),n=e.indexOf("#"),l=e.indexOf("/");return t===-1||l!==-1&&t>l||a!==-1&&t>a||n!==-1&&t>n||sT.test(e.slice(0,t))?e:""}function zm(e,t){let a=String(e);if(typeof t!="string")throw new TypeError("Expected character");let n=0,l=a.indexOf(t);for(;l!==-1;)n++,l=a.indexOf(t,l+t.length);return n}function Bm(e){if(typeof e!="string")throw new TypeError("Expected a string");return e.replace(/[|\\{}()[\]^$+*?.]/g,"\\$&").replace(/-/g,"\\x2d")}function Rm(e,t,a){let l=sl((a||{}).ignore||[]),r=mT(t),o=-1;for(;++o<r.length;)nu(e,"text",i);function i(c,s){let f=-1,d;for(;++f<s.length;){let p=s[f],g=d?d.children:void 0;if(l(p,g?g.indexOf(p):void 0,d))return;d=p}if(d)return u(c,s)}function u(c,s){let f=s[s.length-1],d=r[o][0],p=r[o][1],g=0,w=f.children.indexOf(c),x=!1,m=[];d.lastIndex=0;let h=d.exec(c.value);for(;h;){let L=h.index,I={index:h.index,input:h.input,stack:[...s,c]},C=p(...h,I);if(typeof C=="string"&&(C=C.length>0?{type:"text",value:C}:void 0),C===!1?d.lastIndex=L+1:(g!==L&&m.push({type:"text",value:c.value.slice(g,L)}),Array.isArray(C)?m.push(...C):C&&m.push(C),g=L+h[0].length,x=!0),!d.global)break;h=d.exec(c.value)}return x?(g<c.value.length&&m.push({type:"text",value:c.value.slice(g)}),f.children.splice(w,1,...m)):m=[c],w+m.length}}function mT(e){let t=[];if(!Array.isArray(e))throw new TypeError("Expected find and replace tuple or list of tuples");let a=!e[0]||Array.isArray(e[0])?e:[e],n=-1;for(;++n<a.length;){let l=a[n];t.push([hT(l[0]),gT(l[1])])}return t}function hT(e){return typeof e=="string"?new RegExp(Bm(e),"g"):e}function gT(e){return typeof e=="function"?e:function(){return e}}var Om="phrasing",Nm=["autolink","link","image","label"];function Um(){return{transforms:[CT],enter:{literalAutolink:xT,literalAutolinkEmail:qm,literalAutolinkHttp:qm,literalAutolinkWww:qm},exit:{literalAutolink:vT,literalAutolinkEmail:bT,literalAutolinkHttp:yT,literalAutolinkWww:LT}}}function Pm(){return{unsafe:[{character:"@",before:"[+\\-.\\w]",after:"[\\-.\\w]",inConstruct:Om,notInConstruct:Nm},{character:".",before:"[Ww]",after:"[\\-.\\w]",inConstruct:Om,notInConstruct:Nm},{character:":",before:"[ps]",after:"\\/",inConstruct:Om,notInConstruct:Nm}]}}function xT(e){this.enter({type:"link",title:null,url:"",children:[]},e)}function qm(e){this.config.enter.autolinkProtocol.call(this,e)}function yT(e){this.config.exit.autolinkProtocol.call(this,e)}function LT(e){this.config.exit.data.call(this,e);let t=this.stack[this.stack.length-1];t.type,t.url="http://"+this.sliceSerialize(e)}function bT(e){this.config.exit.autolinkEmail.call(this,e)}function vT(e){this.exit(e)}function CT(e){Rm(e,[[/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/gi,ST],[/(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu,kT]],{ignore:["link","linkReference"]})}function ST(e,t,a,n,l){let r="";if(!Mv(l)||(/^w/i.test(t)&&(a=t+a,t="",r="http://"),!wT(a)))return!1;let o=IT(a+n);if(!o[0])return!1;let i={type:"link",title:null,url:r+t+o[0],children:[{type:"text",value:t+o[0]}]};return o[1]?[i,{type:"text",value:o[1]}]:i}function kT(e,t,a,n){return!Mv(n,!0)||/[-\d_]$/.test(a)?!1:{type:"link",title:null,url:"mailto:"+t+"@"+a,children:[{type:"text",value:t+"@"+a}]}}function wT(e){let t=e.split(".");return!(t.length<2||t[t.length-1]&&(/_/.test(t[t.length-1])||!/[a-zA-Z\d]/.test(t[t.length-1]))||t[t.length-2]&&(/_/.test(t[t.length-2])||!/[a-zA-Z\d]/.test(t[t.length-2])))}function IT(e){let t=/[!"&'),.:;<>?\]}]+$/.exec(e);if(!t)return[e,void 0];e=e.slice(0,t.index);let a=t[0],n=a.indexOf(")"),l=zm(e,"("),r=zm(e,")");for(;n!==-1&&l>r;)e+=a.slice(0,n+1),a=a.slice(n+1),n=a.indexOf(")"),r++;return[e,a]}function Mv(e,t){let a=e.input.charCodeAt(e.index-1);return(e.index===0||Ua(a)||Zl(a))&&(!t||a!==47)}Ev.peek=OT;function AT(){this.buffer()}function TT(e){this.enter({type:"footnoteReference",identifier:"",label:""},e)}function DT(){this.buffer()}function MT(e){this.enter({type:"footnoteDefinition",identifier:"",label:"",children:[]},e)}function ET(e){let t=this.resume(),a=this.stack[this.stack.length-1];a.type,a.identifier=gt(this.sliceSerialize(e)).toLowerCase(),a.label=t}function zT(e){this.exit(e)}function BT(e){let t=this.resume(),a=this.stack[this.stack.length-1];a.type,a.identifier=gt(this.sliceSerialize(e)).toLowerCase(),a.label=t}function RT(e){this.exit(e)}function OT(){return"["}function Ev(e,t,a,n){let l=a.createTracker(n),r=l.move("[^"),o=a.enter("footnoteReference"),i=a.enter("reference");return r+=l.move(a.safe(a.associationId(e),{after:"]",before:r})),i(),o(),r+=l.move("]"),r}function Fm(){return{enter:{gfmFootnoteCallString:AT,gfmFootnoteCall:TT,gfmFootnoteDefinitionLabelString:DT,gfmFootnoteDefinition:MT},exit:{gfmFootnoteCallString:ET,gfmFootnoteCall:zT,gfmFootnoteDefinitionLabelString:BT,gfmFootnoteDefinition:RT}}}function Hm(e){let t=!1;return e&&e.firstLineBlank&&(t=!0),{handlers:{footnoteDefinition:a,footnoteReference:Ev},unsafe:[{character:"[",inConstruct:["label","phrasing","reference"]}]};function a(n,l,r,o){let i=r.createTracker(o),u=i.move("[^"),c=r.enter("footnoteDefinition"),s=r.enter("label");return u+=i.move(r.safe(r.associationId(n),{before:u,after:"]"})),s(),u+=i.move("]:"),n.children&&n.children.length>0&&(i.shift(4),u+=i.move((t?`
`:" ")+r.indentLines(r.containerFlow(n,i.current()),t?zv:NT))),c(),u}}function NT(e,t,a){return t===0?e:zv(e,t,a)}function zv(e,t,a){return(a?"":"    ")+e}var qT=["autolink","destinationLiteral","destinationRaw","reference","titleQuote","titleApostrophe"];Vm.attention=FT;Vm.peek=HT;function _m(){return{canContainEols:["delete"],enter:{strikethrough:UT},exit:{strikethrough:PT}}}function Gm(){return{handlers:{delete:Vm},unsafe:[{character:"~",inConstruct:"phrasing",notInConstruct:qT}]}}function UT(e){this.enter({type:"delete",children:[],position:void 0},e)}function PT(e){this.exit(e)}function Vm(e,t,a,n){let l=a.createTracker(n),r=a.stack.includes("strikethrough")?"~":"~~",o=a.enter("strikethrough"),i=l.move(r);return i+=a.containerPhrasing(e,{...l.current(),before:i,after:"~"}),i+=l.move(r),o(),i}function FT(){return{construct:"strikethrough",markers:["~"],sizes:[2,1]}}function HT(){return"~"}function _T(e){return e.length}function Rv(e,t){let a=t||{},n=(a.align||[]).concat(),l=a.stringLength||_T,r=[],o=[],i=[],u=[],c=0,s=-1;for(;++s<e.length;){let y=[],w=[],x=-1;for(e[s].length>c&&(c=e[s].length);++x<e[s].length;){let m=GT(e[s][x]);if(a.alignDelimiters!==!1){let h=l(m);w[x]=h,(u[x]===void 0||h>u[x])&&(u[x]=h)}y.push(m)}o[s]=y,i[s]=w}let f=-1;if(typeof n=="object"&&"length"in n)for(;++f<c;)r[f]=Bv(n[f]);else{let y=Bv(n);for(;++f<c;)r[f]=y}f=-1;let d=[],p=[];for(;++f<c;){let y=r[f],w="",x="";y===99?(w=":",x=":"):y===108?w=":":y===114&&(x=":");let m=a.alignDelimiters===!1?1:Math.max(1,u[f]-w.length-x.length),h=w+"-".repeat(m)+x;a.alignDelimiters!==!1&&(m=w.length+m+x.length,m>u[f]&&(u[f]=m),p[f]=m),d[f]=h}o.splice(1,0,d),i.splice(1,0,p),s=-1;let g=[];for(;++s<o.length;){let y=o[s],w=i[s];f=-1;let x=[];for(;++f<c;){let m=y[f]||"",h="",L="";if(a.alignDelimiters!==!1){let I=u[f]-(w[f]||0),C=r[f];C===114?h=" ".repeat(I):C===99?I%2?(h=" ".repeat(I/2+.5),L=" ".repeat(I/2-.5)):(h=" ".repeat(I/2),L=h):L=" ".repeat(I)}a.delimiterStart!==!1&&!f&&x.push("|"),a.padding!==!1&&!(a.alignDelimiters===!1&&m==="")&&(a.delimiterStart!==!1||f)&&x.push(" "),a.alignDelimiters!==!1&&x.push(h),x.push(m),a.alignDelimiters!==!1&&x.push(L),a.padding!==!1&&x.push(" "),(a.delimiterEnd!==!1||f!==c-1)&&x.push("|")}g.push(a.delimiterEnd===!1?x.join("").replace(/ +$/,""):x.join(""))}return g.join(`
`)}function GT(e){return e==null?"":String(e)}function Bv(e){let t=typeof e=="string"?e.codePointAt(0):0;return t===67||t===99?99:t===76||t===108?108:t===82||t===114?114:0}var jm=sl(["break","delete","emphasis","footnote","footnoteReference","image","imageReference","inlineCode","inlineMath","link","linkReference","mdxJsxTextElement","mdxTextExpression","strong","text","textDirective"]);function Ov(e,t,a,n){let l=a.enter("blockquote"),r=a.createTracker(n);r.move("> "),r.shift(2);let o=a.indentLines(a.containerFlow(e,r.current()),VT);return l(),o}function VT(e,t,a){return">"+(a?"":" ")+e}function qv(e,t){return Nv(e,t.inConstruct,!0)&&!Nv(e,t.notInConstruct,!1)}function Nv(e,t,a){if(typeof t=="string"&&(t=[t]),!t||t.length===0)return a;let n=-1;for(;++n<t.length;)if(e.includes(t[n]))return!0;return!1}function Xm(e,t,a,n){let l=-1;for(;++l<a.unsafe.length;){let r=a.unsafe[l];if(r.character===`
`&&!r.before&&!r.after&&qv(a.stack,r))return/[\t ]/.test(n.before)?"":" "}return`\\
`}function Uv(e,t){let a=String(e),n=a.indexOf(t),l=n,r=0,o=0;if(typeof t!="string")throw new TypeError("Expected substring");for(;n!==-1;)n===l?++r>o&&(o=r):r=1,l=n+t.length,n=a.indexOf(t,l);return o}function Pv(e,t){return!!(t.options.fences===!1&&e.value&&!e.lang&&/[^\n\r ]/.test(e.value)&&!/^[\t ]*(?:[\n\r]|$)|(?:^|[\n\r])[\t ]*$/.test(e.value))}function Fv(e){let t=e.options.fence||"`";if(t!=="`"&&t!=="~")throw new Error("Cannot serialize code with `"+t+"` for `options.fence`, expected `` ` `` or `~`");return t}function Hv(e,t,a,n){let l=Fv(a),r=e.value||"";if(Pv(e,a)){let f=a.enter("codeIndented"),d=a.indentLines(r,jT);return f(),d}let o=a.createTracker(n),i=l.repeat(Math.max(Uv(r,l)+1,3)),u=a.enter("codeFenced"),c=l==="`"?"GraveAccent":"Tilde",s=o.move(i);if(e.lang){let f=a.enter(`codeFencedLang${c}`);s+=o.move(a.safe(e.lang,{before:s,after:" ",encode:["`"],...o.current()})),f()}if(e.lang&&e.meta){let f=a.enter(`codeFencedMeta${c}`);s+=o.move(" "),s+=o.move(a.safe(e.meta,{before:s,after:`
`,encode:["`"],...o.current()})),f()}return s+=o.move(`
`),r&&(s+=o.move(r+`
`)),s+=o.move(i),u(),s}function jT(e,t,a){return(a?"":"    ")+e}function fo(e){let t=e.options.quote||'"';if(t!=='"'&&t!=="'")throw new Error("Cannot serialize title with `"+t+"` for `options.quote`, expected `\"`, or `'`");return t}function _v(e,t,a,n){let l=fo(a),r=l==='"'?"Quote":"Apostrophe",o=a.enter("definition"),i=a.enter("label"),u=a.createTracker(n),c=u.move("[");return c+=u.move(a.safe(a.associationId(e),{before:c,after:"]",...u.current()})),c+=u.move("]: "),i(),!e.url||/[\0- \u007F]/.test(e.url)?(i=a.enter("destinationLiteral"),c+=u.move("<"),c+=u.move(a.safe(e.url,{before:c,after:">",...u.current()})),c+=u.move(">")):(i=a.enter("destinationRaw"),c+=u.move(a.safe(e.url,{before:c,after:e.title?" ":`
`,...u.current()}))),i(),e.title&&(i=a.enter(`title${r}`),c+=u.move(" "+l),c+=u.move(a.safe(e.title,{before:c,after:l,...u.current()})),c+=u.move(l),i()),o(),c}function Gv(e){let t=e.options.emphasis||"*";if(t!=="*"&&t!=="_")throw new Error("Cannot serialize emphasis with `"+t+"` for `options.emphasis`, expected `*`, or `_`");return t}wc.attention=XT;wc.peek=QT;function wc(e,t,a,n){let l=a.enter("phrasing"),r=a.containerPhrasing({type:"root",children:[e]},n);return l(),r}function XT(e,t){return{construct:"emphasis",markers:Gv(t)==="*"?["*","_"]:["_","*"],sizes:[1]}}function QT(e,t,a){return a.options.emphasis||"*"}function Vv(e){return"&#x"+e.toString(16).toUpperCase()+";"}function jv(e,t){let a=!1;return ar(e,function(n){if("value"in n&&/\r?\n|\r/.test(n.value)||n.type==="break")return a=!0,tr}),!!((!e.depth||e.depth<3)&&Yl(e)&&(t.options.setext||a))}function Xv(e,t,a,n){let l=Math.max(Math.min(6,e.depth||1),1),r=a.createTracker(n);if(jv(e,a)){let f=a.enter("headingSetext"),d=a.enter("phrasing"),p=a.containerPhrasing(e,{...r.current(),before:`
`,after:`
`});return d(),f(),p+`
`+(l===1?"=":"-").repeat(p.length-(Math.max(p.lastIndexOf("\r"),p.lastIndexOf(`
`))+1))}let o="#".repeat(l),i=a.enter("headingAtx"),u=a.enter("phrasing");r.move(o+" ");let c=a.containerPhrasing(e,{before:"# ",after:`
`,...r.current()}),s=c.charCodeAt(0);return(s===9||s===32)&&(c=Vv(s)+c.slice(1)),c=c?o+" "+c:o,a.options.closeAtx&&(c+=" "+o),u(),i(),c}Qm.peek=YT;function Qm(e){return e.value||""}function YT(){return"<"}Ym.peek=KT;function Ym(e,t,a,n){let l=fo(a),r=l==='"'?"Quote":"Apostrophe",o=a.enter("image"),i=a.enter("label"),u=a.createTracker(n),c=u.move("![");return c+=u.move(a.safe(e.alt,{before:c,after:"]",...u.current()})),c+=u.move("]("),i(),!e.url&&e.title||/[\0- \u007F]/.test(e.url)?(i=a.enter("destinationLiteral"),c+=u.move("<"),c+=u.move(a.safe(e.url,{before:c,after:">",...u.current()})),c+=u.move(">")):(i=a.enter("destinationRaw"),c+=u.move(a.safe(e.url,{before:c,after:e.title?" ":")",...u.current()}))),i(),e.title&&(i=a.enter(`title${r}`),c+=u.move(" "+l),c+=u.move(a.safe(e.title,{before:c,after:l,...u.current()})),c+=u.move(l),i()),c+=u.move(")"),o(),c}function KT(){return"!"}Km.peek=ZT;function Km(e,t,a,n){let l=e.referenceType,r=a.enter("imageReference"),o=a.enter("label"),i=a.createTracker(n),u=i.move("!["),c=a.safe(e.alt,{before:u,after:"]",...i.current()});u+=i.move(c+"]["),o();let s=a.stack;a.stack=s.filter(function(d){return d!=="phrasing"}),o=a.enter("reference");let f=a.safe(a.associationId(e),{before:u,after:"]",...i.current()});return o(),a.stack=s,r(),l==="full"||!c||c!==f?u+=i.move(f+"]"):l==="shortcut"?u=u.slice(0,-1):u+=i.move("]"),u}function ZT(){return"!"}Zm.peek=JT;function Zm(e,t,a){let n=e.value||"",l="`",r=-1;for(;new RegExp("(^|[^`])"+l+"([^`]|$)").test(n);)l+="`";for(/[^\n\r ]/.test(n)&&(/^[\n\r ]/.test(n)&&/[\n\r ]$/.test(n)||/^`|`$/.test(n))&&(n=" "+n+" ");++r<a.unsafe.length;){let o=a.unsafe[r],i=a.compilePattern(o);if(!o.atBreak)continue;let u;for(;u=i.exec(n);){let c=u.index;n.charCodeAt(c)===10&&n.charCodeAt(c-1)===13&&c--,n=n.slice(0,c)+" "+n.slice(u.index+1)}}return l+n+l}function JT(){return"`"}function Jm(e,t){let a=Yl(e);return!!(!t.options.resourceLink&&e.url&&!e.title&&e.children&&e.children.length===1&&e.children[0].type==="text"&&(a===e.url||"mailto:"+a===e.url)&&/^[a-z][+\-.a-z]+:/i.test(e.url)&&!/[\0- <>\u007F]/.test(e.url))}Wm.peek=WT;function Wm(e,t,a,n){let l=fo(a),r=l==='"'?"Quote":"Apostrophe",o=a.createTracker(n);if(Jm(e,a)){let s=a.stack;a.stack=s.filter(function(p){return p!=="phrasing"});let f=a.enter("autolink"),d=o.move("<");return d+=o.move(a.containerPhrasing(e,{before:d,after:">",...o.current()})),d+=o.move(">"),f(),a.stack=s,d}let i=a.enter("link"),u=a.enter("label"),c=o.move("[");return c+=o.move(a.containerPhrasing(e,{before:c,after:"](",...o.current()})),c+=o.move("]("),u(),!e.url&&e.title||/[\0- \u007F]/.test(e.url)?(u=a.enter("destinationLiteral"),c+=o.move("<"),c+=o.move(a.safe(e.url,{before:c,after:">",...o.current()})),c+=o.move(">")):(u=a.enter("destinationRaw"),c+=o.move(a.safe(e.url,{before:c,after:e.title?" ":")",...o.current()}))),u(),e.title&&(u=a.enter(`title${r}`),c+=o.move(" "+l),c+=o.move(a.safe(e.title,{before:c,after:l,...o.current()})),c+=o.move(l),u()),c+=o.move(")"),i(),c}function WT(e,t,a){return Jm(e,a)?"<":"["}$m.peek=$T;function $m(e,t,a,n){let l=e.referenceType,r=a.enter("linkReference"),o=a.enter("label"),i=a.createTracker(n),u=i.move("["),c=a.containerPhrasing(e,{before:u,after:"]",...i.current()});u+=i.move(c+"]["),o();let s=a.stack;a.stack=s.filter(function(d){return d!=="phrasing"}),o=a.enter("reference");let f=a.safe(a.associationId(e),{before:u,after:"]",...i.current()});return o(),a.stack=s,r(),l==="full"||!c||c!==f?u+=i.move(f+"]"):l==="shortcut"?u=u.slice(0,-1):u+=i.move("]"),u}function $T(){return"["}function po(e){let t=e.options.bullet||"*";if(t!=="*"&&t!=="+"&&t!=="-")throw new Error("Cannot serialize items with `"+t+"` for `options.bullet`, expected `*`, `+`, or `-`");return t}function Qv(e){let t=po(e),a=e.options.bulletOther;if(!a)return t==="*"?"-":"*";if(a!=="*"&&a!=="+"&&a!=="-")throw new Error("Cannot serialize items with `"+a+"` for `options.bulletOther`, expected `*`, `+`, or `-`");if(a===t)throw new Error("Expected `bullet` (`"+t+"`) and `bulletOther` (`"+a+"`) to be different");return a}function Yv(e){let t=e.options.bulletOrdered||".";if(t!=="."&&t!==")")throw new Error("Cannot serialize items with `"+t+"` for `options.bulletOrdered`, expected `.` or `)`");return t}function Ic(e){let t=e.options.rule||"*";if(t!=="*"&&t!=="-"&&t!=="_")throw new Error("Cannot serialize rules with `"+t+"` for `options.rule`, expected `*`, `-`, or `_`");return t}function Kv(e,t,a,n){let l=a.enter("list"),r=a.bulletCurrent,o=e.ordered?Yv(a):po(a),i=e.ordered?o==="."?")":".":Qv(a),u=t&&a.bulletLastUsed?o===a.bulletLastUsed:!1;if(!e.ordered){let s=e.children?e.children[0]:void 0;if((o==="*"||o==="-")&&s&&(!s.children||!s.children[0])&&a.stack[a.stack.length-1]==="list"&&a.stack[a.stack.length-2]==="listItem"&&a.stack[a.stack.length-3]==="list"&&a.stack[a.stack.length-4]==="listItem"&&a.indexStack[a.indexStack.length-1]===0&&a.indexStack[a.indexStack.length-2]===0&&a.indexStack[a.indexStack.length-3]===0&&(u=!0),Ic(a)===o&&s){let f=-1;for(;++f<e.children.length;){let d=e.children[f];if(d&&d.type==="listItem"&&d.children&&d.children[0]&&d.children[0].type==="thematicBreak"){u=!0;break}}}}u&&(o=i),a.bulletCurrent=o;let c=a.containerFlow(e,n);return a.bulletLastUsed=o,a.bulletCurrent=r,l(),c}function Zv(e){let t=e.options.listItemIndent||"one";if(t!=="tab"&&t!=="one"&&t!=="mixed")throw new Error("Cannot serialize items with `"+t+"` for `options.listItemIndent`, expected `tab`, `one`, or `mixed`");return t}function Jv(e,t,a,n){let l=Zv(a),r=a.bulletCurrent||po(a);t&&t.type==="list"&&t.ordered&&(r=(typeof t.start=="number"&&t.start>-1?t.start:1)+(a.options.incrementListMarker===!1?0:t.children.indexOf(e))+r);let o=r.length+1;(l==="tab"||l==="mixed"&&(t&&t.type==="list"&&t.spread||e.spread))&&(o=Math.ceil(o/4)*4);let i=a.createTracker(n);i.move(r+" ".repeat(o-r.length)),i.shift(o);let u=a.enter("listItem"),c=a.indentLines(a.containerFlow(e,i.current()),s);return u(),c;function s(f,d,p){return d?(p?"":" ".repeat(o))+f:(p?r:r+" ".repeat(o-r.length))+f}}function Wv(e,t,a,n){let l=a.enter("paragraph"),r=a.enter("phrasing"),o=a.containerPhrasing(e,n);return r(),l(),o}function $v(e,t,a,n){if(!e.children.some(function(i){return jm(i)}))return a.containerFlow(e,n);let r=a.enter("phrasing"),o=a.containerPhrasing(e,n);return r(),o}function e0(e){let t=e.options.strong||"*";if(t!=="*"&&t!=="_")throw new Error("Cannot serialize strong with `"+t+"` for `options.strong`, expected `*`, or `_`");return t}Ac.attention=eD;Ac.peek=tD;function Ac(e,t,a,n){let l=a.enter("phrasing"),r=a.containerPhrasing({type:"root",children:[e]},n);return l(),r}function eD(e,t){return{construct:"strong",markers:e0(t)==="*"?["*","_"]:["_","*"],sizes:[2]}}function tD(e,t,a){return a.options.strong||"*"}function t0(e,t,a,n){return a.safe(e.value,n)}function a0(e){let t=e.options.ruleRepetition||3;if(t<3)throw new Error("Cannot serialize rules with repetition `"+t+"` for `options.ruleRepetition`, expected `3` or more");return t}function n0(e,t,a){let n=(Ic(a)+(a.options.ruleSpaces?" ":"")).repeat(a0(a));return a.options.ruleSpaces?n.slice(0,-1):n}var iu={blockquote:Ov,break:Xm,code:Hv,definition:_v,emphasis:wc,hardBreak:Xm,heading:Xv,html:Qm,image:Ym,imageReference:Km,inlineCode:Zm,link:Wm,linkReference:$m,list:Kv,listItem:Jv,paragraph:Wv,root:$v,strong:Ac,text:t0,thematicBreak:n0};function th(){return{enter:{table:aD,tableData:l0,tableHeader:l0,tableRow:lD},exit:{codeText:rD,table:nD,tableData:eh,tableHeader:eh,tableRow:eh}}}function aD(e){let t=e._align;this.enter({type:"table",align:t.map(function(a){return a==="none"?null:a}),children:[]},e),this.data.inTable=!0}function nD(e){this.exit(e),this.data.inTable=void 0}function lD(e){this.enter({type:"tableRow",children:[]},e)}function eh(e){this.exit(e)}function l0(e){this.enter({type:"tableCell",children:[]},e)}function rD(e){let t=this.resume();this.data.inTable&&(t=t.replace(/\\([\\|])/g,oD));let a=this.stack[this.stack.length-1];a.type,a.value=t,this.exit(e)}function oD(e,t){return t==="|"?t:e}function ah(e){let t=e||{},a=t.tableCellPadding,n=t.tablePipeAlign,l=t.stringLength,r=a?" ":"|";return{unsafe:[{character:"\r",inConstruct:"tableCell"},{character:`
`,inConstruct:"tableCell"},{atBreak:!0,character:"|",after:"[	 :-]"},{character:"|",inConstruct:"tableCell"},{atBreak:!0,character:":",after:"-"},{atBreak:!0,character:"-",after:"[:|-]"}],handlers:{inlineCode:d,table:o,tableCell:u,tableRow:i}};function o(p,g,y,w){return c(s(p,y,w),p.align)}function i(p,g,y,w){let x=f(p,y,w),m=c([x]);return m.slice(0,m.indexOf(`
`))}function u(p,g,y,w){let x=y.enter("tableCell"),m=y.enter("phrasing"),h=y.containerPhrasing(p,{...w,before:r,after:r});return m(),x(),h}function c(p,g){return Rv(p,{align:g,alignDelimiters:n,padding:a,stringLength:l})}function s(p,g,y){let w=p.children,x=-1,m=[],h=g.enter("table");for(;++x<w.length;)m[x]=f(w[x],g,y);return h(),m}function f(p,g,y){let w=p.children,x=-1,m=[],h=g.enter("tableRow");for(;++x<w.length;)m[x]=u(w[x],p,g,y);return h(),m}function d(p,g,y){let w=iu.inlineCode(p,g,y);return y.stack.includes("tableCell")&&(w=w.replace(/\|/g,"\\$&")),w}}function nh(){return{exit:{taskListCheckValueChecked:r0,taskListCheckValueUnchecked:r0,paragraph:iD}}}function lh(){return{unsafe:[{atBreak:!0,character:"-",after:"[:|-]"}],handlers:{listItem:uD}}}function r0(e){let t=this.stack[this.stack.length-2];t.type,t.checked=e.type==="taskListCheckValueChecked"}function iD(e){let t=this.stack[this.stack.length-2];if(t&&t.type==="listItem"&&typeof t.checked=="boolean"){let a=this.stack[this.stack.length-1];a.type;let n=a.children[0];if(n&&n.type==="text"){let l=t.children,r=-1,o;for(;++r<l.length;){let i=l[r];if(i.type==="paragraph"){o=i;break}}o===a&&(n.value=n.value.slice(1),n.value.length===0?a.children.shift():a.position&&n.position&&typeof n.position.start.offset=="number"&&(n.position.start.column++,n.position.start.offset++,a.position.start=Object.assign({},n.position.start)))}}this.exit(e)}function uD(e,t,a,n){let l=e.children[0],r=typeof e.checked=="boolean"&&l&&l.type==="paragraph",o="["+(e.checked?"x":" ")+"] ",i=a.createTracker(n);r&&i.move(o);let u=iu.listItem(e,t,a,{...n,...i.current()});return r&&(u=u.replace(/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/,c)),u;function c(s){return s+o}}function rh(){return[Um(),Fm(),_m(),th(),nh()]}function oh(e){return{extensions:[Pm(),Hm(e),Gm(),ah(e),lh()]}}var sD={tokenize:mD,partial:!0},o0={tokenize:hD,partial:!0},i0={tokenize:gD,partial:!0},u0={tokenize:xD,partial:!0},cD={tokenize:yD,partial:!0},s0={name:"wwwAutolink",tokenize:dD,previous:f0},c0={name:"protocolAutolink",tokenize:pD,previous:d0},bn={name:"emailAutolink",tokenize:fD,previous:p0},Fa={};function uh(){return{text:Fa}}var lr=48;for(;lr<123;)Fa[lr]=bn,lr++,lr===58?lr=65:lr===91&&(lr=97);Fa[43]=bn;Fa[45]=bn;Fa[46]=bn;Fa[95]=bn;Fa[72]=[bn,c0];Fa[104]=[bn,c0];Fa[87]=[bn,s0];Fa[119]=[bn,s0];function fD(e,t,a){let n=this,l,r;return o;function o(f){return!ih(f)||!p0.call(n,n.previous)||sh(n.events)?a(f):(e.enter("literalAutolink"),e.enter("literalAutolinkEmail"),i(f))}function i(f){return ih(f)?(e.consume(f),i):f===64?(e.consume(f),u):a(f)}function u(f){return f===46?e.check(cD,s,c)(f):f===45||f===95||Pe(f)?(r=!0,e.consume(f),u):s(f)}function c(f){return e.consume(f),l=!0,u}function s(f){return r&&l&&$e(n.previous)?(e.exit("literalAutolinkEmail"),e.exit("literalAutolink"),t(f)):a(f)}}function dD(e,t,a){let n=this;return l;function l(o){return o!==87&&o!==119||!f0.call(n,n.previous)||sh(n.events)?a(o):(e.enter("literalAutolink"),e.enter("literalAutolinkWww"),e.check(sD,e.attempt(o0,e.attempt(i0,r),a),a)(o))}function r(o){return e.exit("literalAutolinkWww"),e.exit("literalAutolink"),t(o)}}function pD(e,t,a){let n=this,l="",r=!1;return o;function o(f){return(f===72||f===104)&&d0.call(n,n.previous)&&!sh(n.events)?(e.enter("literalAutolink"),e.enter("literalAutolinkHttp"),l+=String.fromCodePoint(f),e.consume(f),i):a(f)}function i(f){if($e(f)&&l.length<5)return l+=String.fromCodePoint(f),e.consume(f),i;if(f===58){let d=l.toLowerCase();if(d==="http"||d==="https")return e.consume(f),u}return a(f)}function u(f){return f===47?(e.consume(f),r?c:(r=!0,u)):a(f)}function c(f){return f===null||Kl(f)||ie(f)||Ua(f)||Zl(f)?a(f):e.attempt(o0,e.attempt(i0,s),a)(f)}function s(f){return e.exit("literalAutolinkHttp"),e.exit("literalAutolink"),t(f)}}function mD(e,t,a){let n=0;return l;function l(o){return(o===87||o===119)&&n<3?(n++,e.consume(o),l):o===46&&n===3?(e.consume(o),r):a(o)}function r(o){return o===null?a(o):t(o)}}function hD(e,t,a){let n,l,r;return o;function o(c){return c===46||c===95?e.check(u0,u,i)(c):c===null||ie(c)||Ua(c)||c!==45&&Zl(c)?u(c):(r=!0,e.consume(c),o)}function i(c){return c===95?n=!0:(l=n,n=void 0),e.consume(c),o}function u(c){return l||n||!r?a(c):t(c)}}function gD(e,t){let a=0,n=0;return l;function l(o){return o===40?(a++,e.consume(o),l):o===41&&n<a?r(o):o===33||o===34||o===38||o===39||o===41||o===42||o===44||o===46||o===58||o===59||o===60||o===63||o===93||o===95||o===126?e.check(u0,t,r)(o):o===null||ie(o)||Ua(o)?t(o):(e.consume(o),l)}function r(o){return o===41&&n++,e.consume(o),l}}function xD(e,t,a){return n;function n(i){return i===33||i===34||i===39||i===41||i===42||i===44||i===46||i===58||i===59||i===63||i===95||i===126?(e.consume(i),n):i===38?(e.consume(i),r):i===93?(e.consume(i),l):i===60||i===null||ie(i)||Ua(i)?t(i):a(i)}function l(i){return i===null||i===40||i===91||ie(i)||Ua(i)?t(i):n(i)}function r(i){return $e(i)?o(i):a(i)}function o(i){return i===59?(e.consume(i),n):$e(i)?(e.consume(i),o):a(i)}}function yD(e,t,a){return n;function n(r){return e.consume(r),l}function l(r){return Pe(r)?a(r):t(r)}}function f0(e){return e===null||e===40||e===42||e===95||e===91||e===93||e===126||ie(e)}function d0(e){return!$e(e)}function p0(e){return!(e===47||ih(e))}function ih(e){return e===43||e===45||e===46||e===95||Pe(e)}function sh(e){let t=e.length,a=!1;for(;t--;){let n=e[t][1];if((n.type==="labelLink"||n.type==="labelImage")&&!n._balanced){a=!0;break}if(n._gfmAutolinkLiteralWalkedInto){a=!1;break}}return e.length>0&&!a&&(e[e.length-1][1]._gfmAutolinkLiteralWalkedInto=!0),a}var LD={tokenize:ID,partial:!0};function ch(){return{document:{91:{name:"gfmFootnoteDefinition",tokenize:SD,continuation:{tokenize:kD},exit:wD}},text:{91:{name:"gfmFootnoteCall",tokenize:CD},93:{name:"gfmPotentialFootnoteCall",add:"after",tokenize:bD,resolveTo:vD}}}}function bD(e,t,a){let n=this,l=n.events.length,r=n.parser.gfmFootnotes||(n.parser.gfmFootnotes=[]),o;for(;l--;){let u=n.events[l][1];if(u.type==="labelImage"){o=u;break}if(u.type==="gfmFootnoteCall"||u.type==="labelLink"||u.type==="label"||u.type==="image"||u.type==="link")break}return i;function i(u){if(!o||!o._balanced)return a(u);let c=gt(n.sliceSerialize({start:o.end,end:n.now()}));return c.codePointAt(0)!==94||!r.includes(c.slice(1))?a(u):(e.enter("gfmFootnoteCallLabelMarker"),e.consume(u),e.exit("gfmFootnoteCallLabelMarker"),t(u))}}function vD(e,t){let a=e.length,n;for(;a--;)if(e[a][1].type==="labelImage"&&e[a][0]==="enter"){n=e[a][1];break}e[a+1][1].type="data",e[a+3][1].type="gfmFootnoteCallLabelMarker";let l={type:"gfmFootnoteCall",start:Object.assign({},e[a+3][1].start),end:Object.assign({},e[e.length-1][1].end)},r={type:"gfmFootnoteCallMarker",start:Object.assign({},e[a+3][1].end),end:Object.assign({},e[a+3][1].end)};r.end.column++,r.end.offset++,r.end._bufferIndex++;let o={type:"gfmFootnoteCallString",start:Object.assign({},r.end),end:Object.assign({},e[e.length-1][1].start)},i={type:"chunkString",contentType:"string",start:Object.assign({},o.start),end:Object.assign({},o.end)},u=[e[a+1],e[a+2],["enter",l,t],e[a+3],e[a+4],["enter",r,t],["exit",r,t],["enter",o,t],["enter",i,t],["exit",i,t],["exit",o,t],e[e.length-2],e[e.length-1],["exit",l,t]];return e.splice(a,e.length-a+1,...u),e}function CD(e,t,a){let n=this,l=n.parser.gfmFootnotes||(n.parser.gfmFootnotes=[]),r=0,o;return i;function i(f){return e.enter("gfmFootnoteCall"),e.enter("gfmFootnoteCallLabelMarker"),e.consume(f),e.exit("gfmFootnoteCallLabelMarker"),u}function u(f){return f!==94?a(f):(e.enter("gfmFootnoteCallMarker"),e.consume(f),e.exit("gfmFootnoteCallMarker"),e.enter("gfmFootnoteCallString"),e.enter("chunkString").contentType="string",c)}function c(f){if(r>999||f===93&&!o||f===null||f===91||ie(f))return a(f);if(f===93){e.exit("chunkString");let d=e.exit("gfmFootnoteCallString");return l.includes(gt(n.sliceSerialize(d)))?(e.enter("gfmFootnoteCallLabelMarker"),e.consume(f),e.exit("gfmFootnoteCallLabelMarker"),e.exit("gfmFootnoteCall"),t):a(f)}return ie(f)||(o=!0),r++,e.consume(f),f===92?s:c}function s(f){return f===91||f===92||f===93?(e.consume(f),r++,c):c(f)}}function SD(e,t,a){let n=this,l=n.parser.gfmFootnotes||(n.parser.gfmFootnotes=[]),r,o=0,i;return u;function u(g){return e.enter("gfmFootnoteDefinition")._container=!0,e.enter("gfmFootnoteDefinitionLabel"),e.enter("gfmFootnoteDefinitionLabelMarker"),e.consume(g),e.exit("gfmFootnoteDefinitionLabelMarker"),c}function c(g){return g===94?(e.enter("gfmFootnoteDefinitionMarker"),e.consume(g),e.exit("gfmFootnoteDefinitionMarker"),e.enter("gfmFootnoteDefinitionLabelString"),e.enter("chunkString").contentType="string",s):a(g)}function s(g){if(o>999||g===93&&!i||g===null||g===91||ie(g))return a(g);if(g===93){e.exit("chunkString");let y=e.exit("gfmFootnoteDefinitionLabelString");return r=gt(n.sliceSerialize(y)),e.enter("gfmFootnoteDefinitionLabelMarker"),e.consume(g),e.exit("gfmFootnoteDefinitionLabelMarker"),e.exit("gfmFootnoteDefinitionLabel"),d}return ie(g)||(i=!0),o++,e.consume(g),g===92?f:s}function f(g){return g===91||g===92||g===93?(e.consume(g),o++,s):s(g)}function d(g){return g===58?(e.enter("definitionMarker"),e.consume(g),e.exit("definitionMarker"),l.includes(r)||l.push(r),Z(e,p,"gfmFootnoteDefinitionWhitespace")):a(g)}function p(g){return t(g)}}function kD(e,t,a){return e.check(Pa,t,e.attempt(LD,t,a))}function wD(e){e.exit("gfmFootnoteDefinition")}function ID(e,t,a){let n=this;return Z(e,l,"gfmFootnoteDefinitionIndent",5);function l(r){let o=n.events[n.events.length-1];return o&&o[1].type==="gfmFootnoteDefinitionIndent"&&o[2].sliceSerialize(o[1],!0).length===4?t(r):a(r)}}function fh(e){let a=(e||{}).singleTilde,n={name:"strikethrough",tokenize:r,resolveAll:l};return a==null&&(a=!0),{text:{126:n},insideSpan:{null:[n]},attentionMarkers:{null:[126]}};function l(o,i){let u=-1;for(;++u<o.length;)if(o[u][0]==="enter"&&o[u][1].type==="strikethroughSequenceTemporary"&&o[u][1]._close){let c=u;for(;c--;)if(o[c][0]==="exit"&&o[c][1].type==="strikethroughSequenceTemporary"&&o[c][1]._open&&o[u][1].end.offset-o[u][1].start.offset===o[c][1].end.offset-o[c][1].start.offset){o[u][1].type="strikethroughSequence",o[c][1].type="strikethroughSequence";let s={type:"strikethrough",start:Object.assign({},o[c][1].start),end:Object.assign({},o[u][1].end)},f={type:"strikethroughText",start:Object.assign({},o[c][1].end),end:Object.assign({},o[u][1].start)},d=[["enter",s,i],["enter",o[c][1],i],["exit",o[c][1],i],["enter",f,i]],p=i.parser.constructs.insideSpan.null;p&&rt(d,d.length,0,il(p,o.slice(c+1,u),i)),rt(d,d.length,0,[["exit",f,i],["enter",o[u][1],i],["exit",o[u][1],i],["exit",s,i]]),rt(o,c-1,u-c+3,d),u=c+d.length-2;break}}for(u=-1;++u<o.length;)o[u][1].type==="strikethroughSequenceTemporary"&&(o[u][1].type="data");return o}function r(o,i,u){let c=this.previous,s=this.events,f=0;return d;function d(g){return c===126&&s[s.length-1][1].type!=="characterEscape"?u(g):(o.enter("strikethroughSequenceTemporary"),p(g))}function p(g){let y=io(c);if(g===126)return f>1?u(g):(o.consume(g),f++,p);if(f<2&&!a)return u(g);let w=o.exit("strikethroughSequenceTemporary"),x=io(g);return w._open=!x||x===2&&!!y,w._close=!y||y===2&&!!x,i(g)}}}var Tc=class{constructor(){this.map=[],this.index=new Map}add(t,a,n){AD(this,t,a,n)}consume(t){if(this.map.sort(function(r,o){return r[0]-o[0]}),this.map.length===0)return;let a=this.map.length,n=[];for(;a>0;)a-=1,n.push(t.slice(this.map[a][0]+this.map[a][1]),this.map[a][2]),t.length=this.map[a][0];n.push(t.slice()),t.length=0;let l=n.pop();for(;l;){for(let r of l)t.push(r);l=n.pop()}this.map.length=0,this.index.clear()}};function AD(e,t,a,n){if(a===0&&n.length===0)return;let l=e.index.get(t);if(l){l[1]+=a,l[2].push(...n);return}let r=[t,a,n];e.map.push(r),e.index.set(t,r)}function m0(e,t){let a=!1,n=[];for(;t<e.length;){let l=e[t];if(a){if(l[0]==="enter")l[1].type==="tableContent"&&n.push(e[t+1][1].type==="tableDelimiterMarker"?"left":"none");else if(l[1].type==="tableContent"){if(e[t-1][1].type==="tableDelimiterMarker"){let r=n.length-1;n[r]=n[r]==="left"?"center":"right"}}else if(l[1].type==="tableDelimiterRow")break}else l[0]==="enter"&&l[1].type==="tableDelimiterRow"&&(a=!0);t+=1}return n}function dh(){return{flow:{null:{name:"table",tokenize:TD,resolveAll:DD}}}}function TD(e,t,a){let n=this,l=0,r=0,o;return i;function i(k){let oe=n.events.length-1;for(;oe>-1;){let{type:E}=n.events[oe][1];if(E==="lineEnding"||E==="linePrefix")oe--;else break}let ne=oe>-1?n.events[oe][1].type:null,z=ne==="tableHead"||ne==="tableRow"?C:u;return z===C&&n.parser.lazy[n.now().line]?a(k):z(k)}function u(k){return e.enter("tableHead"),e.enter("tableRow"),c(k)}function c(k){return k===124||(o=!0,r+=1),s(k)}function s(k){return k===null?a(k):F(k)?r>1?(r=0,n.interrupt=!0,e.exit("tableRow"),e.enter("lineEnding"),e.consume(k),e.exit("lineEnding"),p):a(k):Q(k)?Z(e,s,"whitespace")(k):(r+=1,o&&(o=!1,l+=1),k===124?(e.enter("tableCellDivider"),e.consume(k),e.exit("tableCellDivider"),o=!0,s):(e.enter("data"),f(k)))}function f(k){return k===null||k===124||ie(k)?(e.exit("data"),s(k)):(e.consume(k),k===92?d:f)}function d(k){return k===92||k===124?(e.consume(k),f):f(k)}function p(k){return n.interrupt=!1,n.parser.lazy[n.now().line]?a(k):(e.enter("tableDelimiterRow"),o=!1,Q(k)?Z(e,g,"linePrefix",n.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(k):g(k))}function g(k){return k===45||k===58?w(k):k===124?(o=!0,e.enter("tableCellDivider"),e.consume(k),e.exit("tableCellDivider"),y):I(k)}function y(k){return Q(k)?Z(e,w,"whitespace")(k):w(k)}function w(k){return k===58?(r+=1,o=!0,e.enter("tableDelimiterMarker"),e.consume(k),e.exit("tableDelimiterMarker"),x):k===45?(r+=1,x(k)):k===null||F(k)?L(k):I(k)}function x(k){return k===45?(e.enter("tableDelimiterFiller"),m(k)):I(k)}function m(k){return k===45?(e.consume(k),m):k===58?(o=!0,e.exit("tableDelimiterFiller"),e.enter("tableDelimiterMarker"),e.consume(k),e.exit("tableDelimiterMarker"),h):(e.exit("tableDelimiterFiller"),h(k))}function h(k){return Q(k)?Z(e,L,"whitespace")(k):L(k)}function L(k){return k===124?g(k):k===null||F(k)?!o||l!==r?I(k):(e.exit("tableDelimiterRow"),e.exit("tableHead"),t(k)):I(k)}function I(k){return a(k)}function C(k){return e.enter("tableRow"),T(k)}function T(k){return k===124?(e.enter("tableCellDivider"),e.consume(k),e.exit("tableCellDivider"),T):k===null||F(k)?(e.exit("tableRow"),t(k)):Q(k)?Z(e,T,"whitespace")(k):(e.enter("data"),N(k))}function N(k){return k===null||k===124||ie(k)?(e.exit("data"),T(k)):(e.consume(k),k===92?P:N)}function P(k){return k===92||k===124?(e.consume(k),N):N(k)}}function DD(e,t){let a=-1,n=!0,l=0,r=[0,0,0,0],o=[0,0,0,0],i=!1,u=0,c,s,f,d=new Tc;for(;++a<e.length;){let p=e[a],g=p[1];p[0]==="enter"?g.type==="tableHead"?(i=!1,u!==0&&(h0(d,t,u,c,s),s=void 0,u=0),c={type:"table",start:Object.assign({},g.start),end:Object.assign({},g.end)},d.add(a,0,[["enter",c,t]])):g.type==="tableRow"||g.type==="tableDelimiterRow"?(n=!0,f=void 0,r=[0,0,0,0],o=[0,a+1,0,0],i&&(i=!1,s={type:"tableBody",start:Object.assign({},g.start),end:Object.assign({},g.end)},d.add(a,0,[["enter",s,t]])),l=g.type==="tableDelimiterRow"?2:s?3:1):l&&(g.type==="data"||g.type==="tableDelimiterMarker"||g.type==="tableDelimiterFiller")?(n=!1,o[2]===0&&(r[1]!==0&&(o[0]=o[1],f=Dc(d,t,r,l,void 0,f),r=[0,0,0,0]),o[2]=a)):g.type==="tableCellDivider"&&(n?n=!1:(r[1]!==0&&(o[0]=o[1],f=Dc(d,t,r,l,void 0,f)),r=o,o=[r[1],a,0,0])):g.type==="tableHead"?(i=!0,u=a):g.type==="tableRow"||g.type==="tableDelimiterRow"?(u=a,r[1]!==0?(o[0]=o[1],f=Dc(d,t,r,l,a,f)):o[1]!==0&&(f=Dc(d,t,o,l,a,f)),l=0):l&&(g.type==="data"||g.type==="tableDelimiterMarker"||g.type==="tableDelimiterFiller")&&(o[3]=a)}for(u!==0&&h0(d,t,u,c,s),d.consume(t.events),a=-1;++a<t.events.length;){let p=t.events[a];p[0]==="enter"&&p[1].type==="table"&&(p[1]._align=m0(t.events,a))}return e}function Dc(e,t,a,n,l,r){let o=n===1?"tableHeader":n===2?"tableDelimiter":"tableData",i="tableContent";a[0]!==0&&(r.end=Object.assign({},mo(t.events,a[0])),e.add(a[0],0,[["exit",r,t]]));let u=mo(t.events,a[1]);if(r={type:o,start:Object.assign({},u),end:Object.assign({},u)},e.add(a[1],0,[["enter",r,t]]),a[2]!==0){let c=mo(t.events,a[2]),s=mo(t.events,a[3]),f={type:i,start:Object.assign({},c),end:Object.assign({},s)};if(e.add(a[2],0,[["enter",f,t]]),n!==2){let d=t.events[a[2]],p=t.events[a[3]];if(d[1].end=Object.assign({},p[1].end),d[1].type="chunkText",d[1].contentType="text",a[3]>a[2]+1){let g=a[2]+1,y=a[3]-a[2]-1;e.add(g,y,[])}}e.add(a[3]+1,0,[["exit",f,t]])}return l!==void 0&&(r.end=Object.assign({},mo(t.events,l)),e.add(l,0,[["exit",r,t]]),r=void 0),r}function h0(e,t,a,n,l){let r=[],o=mo(t.events,a);l&&(l.end=Object.assign({},o),r.push(["exit",l,t])),n.end=Object.assign({},o),r.push(["exit",n,t]),e.add(a+1,0,r)}function mo(e,t){let a=e[t],n=a[0]==="enter"?"start":"end";return a[1][n]}var MD={name:"tasklistCheck",tokenize:ED};function ph(){return{text:{91:MD}}}function ED(e,t,a){let n=this;return l;function l(u){return n.previous!==null||!n._gfmTasklistFirstContentOfListItem?a(u):(e.enter("taskListCheck"),e.enter("taskListCheckMarker"),e.consume(u),e.exit("taskListCheckMarker"),r)}function r(u){return ie(u)?(e.enter("taskListCheckValueUnchecked"),e.consume(u),e.exit("taskListCheckValueUnchecked"),o):u===88||u===120?(e.enter("taskListCheckValueChecked"),e.consume(u),e.exit("taskListCheckValueChecked"),o):a(u)}function o(u){return u===93?(e.enter("taskListCheckMarker"),e.consume(u),e.exit("taskListCheckMarker"),e.exit("taskListCheck"),i):a(u)}function i(u){return F(u)?t(u):Q(u)?e.check({tokenize:zD},t,a)(u):a(u)}}function zD(e,t,a){return Z(e,n,"whitespace");function n(l){return l===null?a(l):t(l)}}function g0(e){return ec([uh(),ch(),fh(e),dh(),ph()])}var BD={};function ho(e){let t=this,a=e||BD,n=t.data(),l=n.micromarkExtensions||(n.micromarkExtensions=[]),r=n.fromMarkdownExtensions||(n.fromMarkdownExtensions=[]),o=n.toMarkdownExtensions||(n.toMarkdownExtensions=[]);l.push(g0(a)),r.push(rh()),o.push(oh(a))}var vn=class extends Error{constructor(a,n,l){super(a);this.status=n;this.code=l}},rr=()=>globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,me=encodeURIComponent;function go(e){if(!(typeof e!="string"||!e.trim()))try{let t=new URL(e,window.location.origin);return["http:","https:"].includes(t.protocol)?t.href:void 0}catch{return}}async function mh(e,t={}){let a=new AbortController,n=()=>a.abort();t.signal?.aborted&&a.abort(),t.signal?.addEventListener("abort",n,{once:!0});let l=setTimeout(n,35e3),r=t.body instanceof FormData,o={Accept:"application/json"};r||(o["Content-Type"]="application/json"),window.init?.csrfNonce&&(o["CSRF-Token"]=window.init.csrfNonce,r&&t.body.set("nonce",window.init.csrfNonce)),t.key&&(o["Idempotency-Key"]=t.key);try{let i=await fetch(`/pwncollege_api/v1${e}`,{credentials:"same-origin",method:t.method||"GET",headers:o,body:t.body===void 0?void 0:r?t.body:JSON.stringify(t.body),signal:a.signal}),u;try{u=await i.json()}catch{throw new vn(i.status===413?"\u6587\u4EF6\u8D85\u8FC7\u4E0A\u4F20\u9650\u5236\uFF0C\u8BF7\u62C6\u5206\u540E\u91CD\u8BD5\u3002":"\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",i.status)}if(!i.ok||u.success===!1){let c=typeof u.error=="object"?u.error?.message:u.error;throw new vn(c||u.message||(i.status===401?"\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u3002":"\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"),i.status,u.errorCode||u.error?.code)}return u.data??u}finally{clearTimeout(l),t.signal?.removeEventListener("abort",n)}}var Oe=(e,t)=>mh("/teaching"+e,t);function x0(e,t){let a=new Set(e.map(Mc)),n=[...e];for(let l of t)a.has(Mc(l))||(a.add(Mc(l)),n.push(l));return n}function Mc(e){return String(e.id||`${e.sourceJobId||e.details?.agentRun?.runId}:${e.sourceSequence??e.sequence??e.details?.agentRun?.seq}`)}function Ec(e,t,a=!1){let n=new Map,l=[];for(let r of t){let o=r.details?.agentRun;if(o?.runId&&o?.type){let i=n.get(o.runId)||[];i.push(o),n.set(o.runId,i)}else(r.message||r.label)&&l.push({id:Mc(r),jobId:e,runId:"",kind:"workflow",title:String(r.message||r.label),status:r.status==="FAILED"?"failed":"completed"})}for(let[r,o]of n){let i=new Map,u=!1,c="incomplete";for(let s of o.sort((f,d)=>Number(f.seq)-Number(d.seq))){if(s.type==="item.started"&&s.item?.id&&!i.has(s.item.id)){let d={...s.item,id:`${r}:${s.item.id}`,jobId:e,runId:r,status:s.item.status||"running"};i.set(s.item.id,d),l.push(d)}let f=i.get(s.itemId);if(f&&s.type==="item.delta"){let d=s.channel==="output"?"output":"content";f[d]=(f[d]||"")+(typeof s.delta=="string"?s.delta:"")}if(f&&s.type==="item.updated")for(let d of["kind","title","subtitle","content","output","input","command","cwd","exitCode","status","usage","metadata"])s.patch?.[d]!==void 0&&(f[d]=s.patch[d]);f&&s.type==="item.completed"&&Object.assign(f,{status:s.status||"completed",completedAt:s.time},s.output!==void 0?{output:s.output}:{},s.exitCode!==void 0?{exitCode:s.exitCode}:{},s.metadata!==void 0?{metadata:{...f.metadata,...s.metadata}}:{}),["run.completed","run.failed","run.cancelled"].includes(s.type)&&(u=!0,c=s.type==="run.failed"?"failed":s.type==="run.cancelled"?"cancelled":"incomplete",(s.error||s.reason)&&l.push({id:`${r}:end`,jobId:e,runId:r,kind:"workflow",title:"\u6267\u884C\u7ED3\u675F",content:String(s.error||s.reason),status:c}))}if(u||a)for(let s of i.values())s.status==="running"&&(s.status=c)}return l}function y0(e){let t=/"(?:answer|message)"\s*:\s*"/.exec(e);if(!t)return e.trimStart().startsWith("{")?"":e;let a=t.index+t[0].length,n="",l=!1;for(let r=a;r<e.length;r++){let o=e[r];if(l){if(o==="u"){let i=e.slice(r+1,r+5);if(i.length<4)break;/^[a-f0-9]{4}$/i.test(i)&&(n+=String.fromCharCode(parseInt(i,16)),r+=4)}else n+={n:`
`,r:"\r",t:"	"}[o]??o;l=!1}else if(o==="\\")l=!0;else{if(o==='"')break;n+=o}}return n}function hh(e,t){return t?.version===1&&t.requestId===e.id&&t.requestSha256===e.sha256&&(t.decision==="APPROVED"||t.decision==="REJECTED")}function gh(e){return typeof e=="string"&&/^[A-Za-z0-9_-]{1,48}$/.test(e)}function zc(e,t,a){let n=t.metadata.toolProposals?.[a],l=t.metadata.toolProposalApprovalRequests?.[String(a)],r=n?.arguments;if(t.role!=="assistant"||t.metadata.pending!==!1||e.status!=="ACTIVE"||!Number.isSafeInteger(e.dojoId)||n?.tool!=="classroom.prepare"||n.requiresConfirmation!==!0||n.boundScope?.dojoId!==e.dojoId||n.boundScope?.moduleIndex!==(e.moduleIndex??null)||typeof r?.artifactId!="string"||!r.artifactId||!Number.isSafeInteger(r.expectedRevision)||r.expectedRevision<1||typeof r.contentHash!="string"||!/^[a-f0-9]{64}$/.test(r.contentHash)||typeof l?.id!="string"||!l.id||typeof l.sha256!="string"||!/^[a-f0-9]{64}$/.test(l.sha256))return null;let o={id:l.id,sha256:l.sha256},i=t.metadata.toolProposalDecisions?.[String(a)];if(i&&!hh(o,i))return null;let u=t.metadata.toolExecutionResults?.[String(a)],c=i?.decision==="APPROVED"&&u?.tool==="classroom.prepare"&&u.status==="SUCCEEDED"&&u.artifactId===r.artifactId&&u.artifactRevision===r.expectedRevision&&gh(u.sessionId)?u.sessionId:null;return{approval:o,decision:i?.decision,artifactId:r.artifactId,revision:r.expectedRevision,sessionId:c}}function L0(e,t){return"/teacher?"+new URLSearchParams({view:"dashboard",thread:e,classroom:t})}var Ha=J(je(),1);var he=J(ye(),1),b0=e=>e.title||e.content?.title||"\u751F\u6210\u6210\u54C1";function RD({candidateSetId:e,candidates:t,close:a}){let{controller:n,state:l}=ce(),[r,o]=(0,Ha.useState)([]),[i,u]=(0,Ha.useState)(""),[c,s]=(0,Ha.useState)(3),[f,d]=(0,Ha.useState)(""),[p,g]=(0,Ha.useState)(null),y=t.filter(h=>r.includes(h.id)).map(h=>h.id),w={candidateIds:y,instruction:i.trim(),candidateCount:c},x=JSON.stringify(w),m=p&&l.jobs.find(h=>h.id===p.jobId);return(0,he.jsxs)("details",{className:"candidate-derive",children:[(0,he.jsx)("summary",{children:"\u4ECE\u73B0\u6709\u65B9\u6848\u6D3E\u751F"}),(0,he.jsxs)("form",{onSubmit:h=>{h.preventDefault(),!(!y.length||!w.instruction||p?.signature===x)&&n.run(async()=>{d("");try{let L=await n.deriveDebateCandidates(e,w);g({jobId:L.id,status:L.status,signature:x})}catch(L){d(L instanceof Error?L.message:"\u65E0\u6CD5\u63D0\u4EA4\u6D3E\u751F\u4EFB\u52A1\uFF0C\u8BF7\u91CD\u8BD5\u3002")}})},children:[(0,he.jsxs)("fieldset",{disabled:l.busy,children:[(0,he.jsx)("legend",{children:"\u9009\u62E9\u4E00\u81F3\u56DB\u4EFD\u53C2\u8003\u65B9\u6848"}),t.map(h=>(0,he.jsxs)("label",{className:"candidate-derive-option",children:[(0,he.jsx)("input",{type:"checkbox",checked:r.includes(h.id),disabled:r.length>=4&&!r.includes(h.id),onChange:L=>{let I=L.currentTarget.checked;o(C=>I?[...C,h.id]:C.filter(T=>T!==h.id))}}),b0(h)]},h.id))]}),(0,he.jsxs)("label",{className:"field",children:["\u6D3E\u751F\u8981\u6C42",(0,he.jsx)("textarea",{value:i,onChange:h=>u(h.target.value),rows:3,maxLength:16e3,required:!0,disabled:l.busy})]}),(0,he.jsxs)("label",{className:"field",children:["\u65B0\u65B9\u6848\u6570\u91CF",(0,he.jsx)("select",{value:c,onChange:h=>s(Number(h.target.value)),disabled:l.busy,children:[2,3,4].map(h=>(0,he.jsxs)("option",{value:h,children:[h," \u4EFD"]},h))})]}),(0,he.jsx)(_,{type:"submit",className:"primary",disabled:l.busy||!y.length||!w.instruction||p?.signature===x,children:"\u751F\u6210\u65B0\u8FA9\u8BBA\u65B9\u6848"}),f&&(0,he.jsx)("p",{className:"candidate-derive-result",role:"alert",children:f}),p&&(0,he.jsxs)("div",{className:"candidate-derive-result",children:[(0,he.jsxs)("p",{role:"status",children:["\u6D3E\u751F\u4EFB\u52A1\u5DF2\u63D0\u4EA4\u3002",(0,he.jsx)(Zt,{status:m?.status||p.status})," \u5B8C\u6210\u540E\u53EF\u5728\u4EFB\u52A1\u4E2D\u5FC3\u67E5\u770B\u8FA9\u8BBA\u5019\u9009\u3002"]}),(0,he.jsx)(_,{onClick:()=>{n.patch({taskCenter:!0}),a()},children:"\u6253\u5F00\u4EFB\u52A1\u4E2D\u5FC3"})]})]})]})}function Bc({candidateSetId:e,close:t}){let{state:a,controller:n}=ce(),[l,r]=(0,Ha.useState)(null),[o,i]=(0,Ha.useState)("");(0,Ha.useEffect)(()=>{let f=new AbortController;return Oe(`/candidate-sets/${me(e)}`,{signal:f.signal}).then(d=>{f.signal.aborted||r(d.candidateSet)}).catch(d=>{f.signal.aborted||i(d instanceof Error?d.message:"\u65E0\u6CD5\u8BFB\u53D6\u751F\u6210\u7ED3\u679C\u3002")}),()=>f.abort()},[e]);let u=l?.candidates||[],c=l?.request?.generationReason==="teacher_requested_native_courseware",s=l?.kind==="debate"&&!l.selfWorkspaceId&&l.request?.generationReason==="teacher_requested_ordinary_debate";return(0,he.jsx)(ma,{title:c?"\u9009\u62E9\u8BFE\u4EF6\u65B9\u6848":"\u5BA1\u9605\u751F\u6210\u6210\u54C1",onClose:t,wide:!0,children:(0,he.jsxs)("div",{className:"dialog-body",children:[o?(0,he.jsx)("p",{role:"alert",children:o}):l?u.map(f=>(0,he.jsxs)("section",{className:"candidate",children:[(0,he.jsx)("h3",{children:b0(f)}),(0,he.jsx)("p",{children:f.summary||f.content?.summary}),f.validation?.status&&(0,he.jsx)(Zt,{status:f.validation.status}),(0,he.jsxs)("details",{children:[(0,he.jsx)("summary",{children:"\u68C0\u67E5\u751F\u6210\u5185\u5BB9"}),(0,he.jsx)(va,{value:f.content})]}),(0,he.jsx)(_,{className:"primary",disabled:a.busy,onClick:()=>void n.run(async()=>{let d=await Oe(`/candidates/${me(f.id)}/materialize`,{method:"POST",body:{}});await n.loadArtifacts(),d.artifact?.id&&(await n.openArtifact(d.artifact.id),t())}),children:c?"\u751F\u6210\u8BFE\u4EF6":"\u6253\u5F00\u6210\u54C1\u5DE5\u4F5C\u533A"})]},f.id)):(0,he.jsx)("p",{children:"\u6B63\u5728\u8BFB\u53D6\u2026"}),s&&u.length>0&&(0,he.jsx)(RD,{candidateSetId:e,candidates:u,close:t})]})})}var Sa=J(je(),1);var uu=[{title:"\u5E73\u53F0\u6559\u6848",subtitle:"\u6BD4\u8F83\u5019\u9009\uFF0C\u751F\u6210\u5E73\u53F0\u6210\u54C1",prompt:"\u8BF7\u751F\u6210\u666E\u901A\u6559\u6848\u5019\u9009\uFF1A"},{title:"\u8BFE\u5802\u8FA9\u8BBA",subtitle:"\u8BBE\u8BA1\u8FA9\u9898\u3001\u7ACB\u573A\u4E0E\u6D41\u7A0B",prompt:"\u8BF7\u751F\u6210\u666E\u901A\u8BFE\u5802\u8FA9\u8BBA\u5019\u9009\u65B9\u6848\uFF1A"},{title:"\u5236\u4F5C\u8BFE\u4EF6",subtitle:"\u751F\u6210\u53EF\u7F16\u8F91\u7684\u539F\u751F\u5E7B\u706F\u7247",prompt:"\u8BF7\u5236\u4F5C\u4E00\u4EFD\u8BFE\u4EF6\uFF1A"},{title:"\u52A8\u6001\u4EFF\u771F",subtitle:"\u8BBE\u8BA1\u53EF\u8C03\u8282\u3001\u53EF\u6BD4\u8F83\u7684\u6A21\u62DF",prompt:"\u8BF7\u5236\u4F5C\u4E00\u4E2A\u52A8\u6001\u4EFF\u771F\uFF1A"}];function Rc(e){return e.type==="slide-deck"&&e.revision?.content?.ordinaryCourseware==="teaching-courseware-v1"}function Oc({context:e,thread:t}){let a=e.ordinaryProjectCourseIds||[];return t?.dojoId==null?a.length===1:a.includes(t.dojoId)}function v0(e,t){let a=t.trim(),n=uu.find(({prompt:l})=>a.startsWith(l));return e+(n?a.slice(n.prompt.length):a)}function Nc(e){return e.replace(/(^|[。！？\n]\s*)当前(?:我|这条对话)只支持文字问答[。.]?(?=\s*(?:$|\n))/gu,(t,a)=>a.trimEnd()).trimEnd()}var U=J(ye(),1);function OD({turn:e}){let{state:t,controller:a}=ce(),[n,l]=(0,Sa.useState)(!1),[r,o]=(0,Sa.useState)(e.content);return(0,U.jsxs)("div",{className:"queue-row",children:[(0,U.jsx)(Di,{size:14}),(0,U.jsxs)("div",{children:[(0,U.jsx)("small",{children:e.delivery==="next-step"?e.acknowledgedAtBoundary?"\u8865\u5145\u5DF2\u63A5\u6536":"\u4E0B\u4E00\u6B65\u8865\u5145":"\u5F53\u524D\u4EFB\u52A1\u540E\u6267\u884C"}),n?(0,U.jsx)("textarea",{"aria-label":"\u4FEE\u6539\u6392\u961F\u8981\u6C42",value:r,onChange:i=>o(i.target.value),rows:3}):(0,U.jsx)("p",{children:e.content})]}),n?(0,U.jsxs)(U.Fragment,{children:[(0,U.jsx)(K,{label:"\u4FDD\u5B58\u6392\u961F\u8981\u6C42",disabled:t.busy||!r.trim(),onClick:()=>void a.run(async()=>{await a.editQueue(e.jobId,r,e.revision),l(!1)}),children:(0,U.jsx)(Bt,{size:15})}),(0,U.jsx)(K,{label:"\u53D6\u6D88\u7F16\u8F91",onClick:()=>l(!1),children:(0,U.jsx)(Re,{size:15})})]}):(0,U.jsxs)(U.Fragment,{children:[(0,U.jsx)(K,{label:"\u7F16\u8F91\u6392\u961F\u8981\u6C42",onClick:()=>{o(e.content),l(!0)},children:(0,U.jsx)(Hl,{size:14})}),(0,U.jsx)(K,{label:"\u64A4\u56DE\u6392\u961F\u8981\u6C42",disabled:t.busy,onClick:()=>void a.run(()=>a.cancel(e.jobId)),children:(0,U.jsx)(Re,{size:15})})]})]})}function xh({welcome:e=!1}){let{state:t,controller:a}=ce(),n=(0,Sa.useRef)(null),l=(0,Sa.useRef)(null),[r,o]=(0,Sa.useState)(!1),[i,u]=(0,Sa.useState)(!1),c=t.draft,s=document.getElementById("cocreation-workbench")?.dataset.scopedTeaching==="true",f=t.jobs.find(y=>y.threadId===t.thread?.id&&!nt(y)),d=t.thread?.status==="ARCHIVED",p=!!c.text.trim()&&!t.busy&&!t.loadingThread&&!t.uploads.length&&!d,g=s&&Oc(t);return(0,Sa.useEffect)(()=>{n.current&&(n.current.style.height="auto",n.current.style.height=Math.min(200,n.current.scrollHeight)+"px")},[c.text]),(0,Sa.useEffect)(()=>{let y=()=>n.current?.focus();return window.addEventListener("workbench-focus-composer",y),()=>window.removeEventListener("workbench-focus-composer",y)},[]),(0,U.jsxs)("div",{className:`composer-area ${e?"welcome-composer":""}`,children:[(t.thread?.pendingTurns||[]).length>0&&(0,U.jsx)("div",{className:"queue-dock","aria-label":"\u5F85\u5904\u7406\u8981\u6C42",children:t.thread?.pendingTurns?.map(y=>(0,U.jsx)(OD,{turn:y},y.jobId))}),d?(0,U.jsxs)("div",{className:"archive-notice",children:["\u6B64\u4F1A\u8BDD\u5DF2\u5F52\u6863\u3002",(0,U.jsx)(_,{onClick:()=>void a.run(()=>a.updateThread(t.thread.id,{archived:!1})),children:"\u6062\u590D\u4F1A\u8BDD"})]}):(0,U.jsxs)("div",{className:`composer ${i?"dragging":""}`,onDragOver:y=>{y.preventDefault(),u(!0)},onDragLeave:y=>{y.currentTarget.contains(y.relatedTarget)||u(!1)},onDrop:y=>{y.preventDefault(),u(!1),y.dataTransfer.files.length&&a.upload([...y.dataTransfer.files]).catch(a.error)},children:[(c.sources.length>0||c.skills.length>0||t.uploads.length>0)&&(0,U.jsxs)("div",{className:"context-chips",children:[c.sources.map(y=>(0,U.jsxs)("span",{className:"chip",children:[(0,U.jsx)(nl,{size:12}),(0,U.jsx)("span",{children:y.name}),(0,U.jsx)(K,{label:`\u79FB\u9664\u5F15\u7528 ${y.name}`,onClick:()=>a.setDraft({sources:c.sources.filter(w=>w.id!==y.id)}),children:(0,U.jsx)(Re,{size:12})})]},y.id)),c.skills.map(y=>(0,U.jsxs)("span",{className:"chip",children:[(0,U.jsx)(Rt,{size:12}),"/",y,(0,U.jsx)(K,{label:`\u79FB\u9664\u6280\u80FD ${y}`,onClick:()=>a.setDraft({skills:c.skills.filter(w=>w!==y)}),children:(0,U.jsx)(Re,{size:12})})]},y)),t.uploads.map(y=>(0,U.jsxs)("span",{className:`chip ${y.state}`,title:y.error,children:[y.state==="uploading"&&(0,U.jsx)(St,{size:12,className:"spin"}),(0,U.jsxs)("span",{children:[y.name,y.state==="error"?" \xB7 \u4E0A\u4F20\u5931\u8D25":" \xB7 \u4E0A\u4F20\u4E2D"]}),y.state==="error"&&(0,U.jsx)(K,{label:"\u79FB\u9664\u5931\u8D25\u4E0A\u4F20",onClick:()=>a.patch({uploads:t.uploads.filter(w=>w.id!==y.id)}),children:(0,U.jsx)(Re,{size:12})})]},y.id))]}),(0,U.jsx)("textarea",{ref:n,id:"workbench-prompt","aria-label":"\u8F93\u5165\u6559\u5B66\u8981\u6C42",placeholder:i?"\u677E\u5F00\u4EE5\u6DFB\u52A0\u6587\u4EF6":g?"\u63CF\u8FF0\u60F3\u505A\u7684\u6559\u6848\u3001\u8BFE\u5802\u6D3B\u52A8\u6216\u8981\u4FEE\u6539\u7684\u5185\u5BB9\u2026":"\u76F4\u63A5\u63D0\u95EE\u3001\u63CF\u8FF0\u6559\u5B66\u76EE\u6807\uFF0C\u6216\u7EE7\u7EED\u4FEE\u6539\u5DF2\u6709\u5185\u5BB9\u2026",value:c.text,rows:1,onChange:y=>a.setDraft({text:y.target.value}),onKeyDown:y=>{y.nativeEvent.isComposing||y.keyCode===229||y.key==="Enter"&&!y.shiftKey&&(y.preventDefault(),p&&a.send(f&&(y.metaKey||y.ctrlKey)?{delivery:c.delivery==="after-current"?"next-step":"after-current"}:{}))}}),(0,U.jsxs)("div",{className:"composer-toolbar",children:[(0,U.jsxs)("div",{className:"add-context",children:[(0,U.jsx)(K,{label:"\u6DFB\u52A0\u4E0A\u4E0B\u6587","aria-expanded":r,onClick:()=>o(!r),children:(0,U.jsx)(Oa,{size:18})}),r&&(0,U.jsxs)("div",{className:"composer-menu",children:[(0,U.jsxs)(_,{onClick:()=>{o(!1),l.current?.click()},children:[(0,U.jsx)(nl,{size:15}),"\u4E0A\u4F20\u6587\u4EF6"]}),(0,U.jsxs)(_,{onClick:()=>{o(!1),a.openCatalog("sources")},children:[(0,U.jsx)(za,{size:15}),"\u5F15\u7528\u8D44\u6599\u5E93"]}),(0,U.jsxs)(_,{onClick:()=>{o(!1),a.openCatalog("skills")},children:[(0,U.jsx)(Rt,{size:15}),"\u9009\u62E9\u6280\u80FD"]})]})]}),(0,U.jsx)("input",{ref:l,type:"file",multiple:!0,hidden:!0,onChange:y=>{y.target.files&&a.upload([...y.target.files]).catch(a.error),y.target.value=""}}),g&&!e&&uu.map(({title:y,prompt:w})=>(0,U.jsx)(_,{className:"teaching-project-button",disabled:t.busy,onClick:()=>{a.setDraft({text:v0(w,c.text),artifactType:"auto",learningPattern:""}),n.current?.focus()},children:y},y)),!s&&(0,U.jsxs)("select",{"aria-label":"\u5B66\u4E60\u6A21\u5F0F",value:c.learningPattern,onChange:y=>a.setDraft({learningPattern:y.target.value}),children:[(0,U.jsx)("option",{value:"",children:"\u901A\u7528\u521B\u4F5C"}),(0,U.jsx)("option",{value:"process-inquiry",children:"\u6D41\u7A0B\u63A2\u7A76 \xB7 AES-128"})]}),(0,U.jsx)("div",{className:"push"}),f&&(0,U.jsxs)("select",{"aria-label":"\u53D1\u9001\u65F6\u673A",value:c.delivery,onChange:y=>a.setDraft({delivery:y.target.value}),children:[(0,U.jsx)("option",{value:"after-current",children:"\u6392\u961F"}),(0,U.jsx)("option",{value:"next-step",children:"\u4E0B\u4E00\u6B65\u8865\u5145"})]}),f&&(0,U.jsx)(K,{label:"\u505C\u6B62\u5F53\u524D\u4EFB\u52A1",className:"stop-button",disabled:t.busy,onClick:()=>void a.run(()=>a.cancel(f.id)),children:(0,U.jsx)(Gl,{size:14,fill:"currentColor"})}),!s&&js(c.sources)&&(0,U.jsx)(_,{disabled:!p,onClick:()=>void a.send({},"ask"),children:"\u4EC5\u95EE\u7B54"}),(0,U.jsx)(K,{label:t.busy?"\u6B63\u5728\u63D0\u4EA4":f?c.delivery==="next-step"?"\u4E0B\u4E00\u6B65\u8865\u5145":"\u52A0\u5165\u961F\u5217":"\u53D1\u9001\u8981\u6C42",className:"send-button",disabled:!p,onClick:()=>void a.send(),children:t.busy?(0,U.jsx)(St,{size:17,className:"spin"}):(0,U.jsx)(Bl,{size:19})})]})]}),(0,U.jsxs)("div",{className:"composer-footnote",children:[f&&(0,U.jsx)("span",{children:"\u5173\u95ED\u9875\u9762\u540E\uFF0C\u4EFB\u52A1\u4ECD\u5728\u540E\u53F0\u6267\u884C"}),(0,U.jsxs)("span",{children:[(0,U.jsx)(Mi,{size:11})," \u53D1\u9001"," ",(0,U.jsx)("span",{className:"desktop-only",children:" \xB7 Shift Enter \u6362\u884C"})]})]})]})}var C0=J(je(),1);var yt=J(ye(),1);function S0({bundle:e,option:t,messageId:a,onClose:n}){let{state:l,controller:r}=ce(),o=Math.max(1,Number(e.baseArguments?.challengeCount||1)),[i,u]=(0,C0.useState)(()=>Array.from({length:o},(s,f)=>({itemIndex:f+1,title:String(e.baseArguments?.constraints?.batchTopics?.[f]||`${t.title}${o>1?` \xB7 \u7B2C ${f+1} \u9898`:""}`).slice(0,80),difficulty:o===3?["\u7B80\u5355","\u4E2D\u7B49","\u56F0\u96BE"][f]:"\u6309\u5F53\u524D\u65B9\u6848"}))),c=i.every(s=>s.title.trim().length>=2)&&new Set(i.map(s=>s.title.trim())).size===o;return(0,yt.jsxs)(ma,{title:"\u786E\u8BA4\u5B9E\u8DF5\u9898\u751F\u6210",onClose:n,children:[(0,yt.jsxs)("div",{className:"dialog-body",children:[(0,yt.jsxs)("p",{children:["\u751F\u6210 ",o," \u9053\u72EC\u7ACB\u5B9E\u8DF5\u9898\u3002\u8BF7\u6838\u5BF9\u6807\u9898\u4E0E\u96BE\u5EA6\uFF1B\u6BCF\u9053\u9898\u90FD\u4FDD\u7559\u72EC\u7ACB\u73AF\u5883\u3001\u9A8C\u8BC1\u548C\u91CD\u8BD5\u8BB0\u5F55\u3002"]}),i.map((s,f)=>(0,yt.jsxs)("fieldset",{children:[(0,yt.jsxs)("legend",{children:["\u7B2C ",s.itemIndex," \u9053\u9898"]}),(0,yt.jsxs)("label",{className:"field",children:["\u9898\u76EE\u6807\u9898",(0,yt.jsx)("input",{value:s.title,minLength:2,maxLength:80,onChange:d=>u(i.map((p,g)=>g===f?{...p,title:d.target.value}:p))})]}),(0,yt.jsxs)("label",{className:"field",children:["\u96BE\u5EA6",(0,yt.jsx)("select",{value:s.difficulty,onChange:d=>u(i.map((p,g)=>g===f?{...p,difficulty:d.target.value}:p)),children:["\u7B80\u5355","\u4E2D\u7B49","\u56F0\u96BE","\u6309\u5F53\u524D\u65B9\u6848"].map(d=>(0,yt.jsx)("option",{children:d},d))})]})]},s.itemIndex)),(0,yt.jsx)("p",{className:"quiet",children:"\u751F\u6210\u540E\u4FDD\u5B58\u4E3A\u8349\u7A3F\uFF0C\u5BA1\u9605\u540E\u518D\u53D1\u5E03\u3002"})]}),(0,yt.jsxs)("div",{className:"dialog-actions",children:[(0,yt.jsx)(_,{onClick:n,children:"\u8FD4\u56DE\u4FEE\u6539"}),(0,yt.jsxs)(_,{className:"primary",disabled:l.busy||!c,onClick:()=>void r.run(async()=>{await r.selectOption(a,t.id,{requestedCount:o,independence:"independent_challenges",exerciseMode:"CTF",publishMode:"draft",items:i.map(s=>({...s,title:s.title.trim()}))}),n()}),children:["\u786E\u8BA4\u751F\u6210 ",o," \u9053\u9898"]})]})]})}function qc(e,t){try{let a=localStorage.getItem(e);return a?JSON.parse(a):t}catch{return t}}function Uc(e,t){try{localStorage.setItem(e,JSON.stringify(t))}catch{}}var Fc=()=>({learningPattern:"",text:"",mode:"auto",delivery:"after-current",sources:[],skills:[],artifactType:"auto"}),Pc=class{constructor(t){this.owner=t}name(t,a="draft"){return`aisecedu:workbench:v3:${this.owner}:${t||"new"}:${a}`}draft(t,a=""){let n=qc(this.name(t),{});return{...Fc(),...n,learningPattern:(n.learningPattern??a)==="process-inquiry"?"process-inquiry":"",mode:"auto",sources:Array.isArray(n.sources)?n.sources:[],skills:Array.isArray(n.skills)?n.skills:[]}}save(t,a){Uc(this.name(t),a)}value(t,a){return qc(this.name(null,t),a)}set(t,a){Uc(this.name(null,t),a)}};var Ze=J(je(),1);var k0={docx:"Word \u6587\u6863",md:"Markdown",txt:"\u7EAF\u6587\u672C",html:"\u7F51\u9875",csv:"CSV \u8868\u683C",json:"JSON",ipynb:"Jupyter \u7B14\u8BB0\u672C"},Hc=e=>k0[e]||e.toUpperCase();function yh(e){if(!e||typeof e!="object")return;let{id:t,jobId:a,filename:n,format:l,size:r}=e;if(!(typeof t!="string"||!/^file_[a-f0-9]{32}$/.test(t)||typeof a!="string"||!/^[a-z0-9_-]{1,64}$/i.test(a)||typeof n!="string"||!n.trim()||typeof l!="string"||!Object.hasOwn(k0,l)))return{id:t,jobId:a,filename:n,format:l,size:typeof r=="number"&&r>0?r:0}}function xo(e=[]){let t=new Map;for(let a of e){let n=a.metadata?.files;if(Array.isArray(n))for(let l of n){let r=yh(l);r&&t.set(r.id,r)}}return[...t.values()].reverse()}var Lh=e=>`/jobs/${encodeURIComponent(e.jobId)}/files/${encodeURIComponent(e.id)}`,or=e=>`/pwncollege_api/v1/teaching${Lh(e)}`;function _c(e){return e>=1024*1024?`${(e/(1024*1024)).toFixed(1)} MB`:`${Math.max(1,Math.round(e/1024))} KB`}var V=J(ye(),1);function Gc({format:e,size:t=21}){let a=e==="csv"?Ei:["json","html","ipynb"].includes(e)?Ba:Ge;return(0,V.jsx)(a,{size:t,"aria-hidden":"true"})}function w0({text:e}){return(0,V.jsx)("div",{className:"markdown",children:(0,V.jsx)(ou,{skipHtml:!0,remarkPlugins:[ho],components:{img:({alt:t})=>t?(0,V.jsx)("span",{children:t}):null,a:({children:t})=>(0,V.jsx)("span",{children:t})},children:e})})}function ND(e){if(e instanceof vn){if(e.status===422)return"\u8FD9\u4EFD\u6587\u4EF6\u8D85\u51FA\u5728\u7EBF\u9884\u89C8\u8303\u56F4\uFF0C\u53EF\u4EE5\u4E0B\u8F7D\u539F\u6587\u4EF6\u3002";if(e.status===401||e.status===404)return"\u5F53\u524D\u4F1A\u8BDD\u65E0\u6CD5\u8BFB\u53D6\u8FD9\u4EFD\u6587\u4EF6\u3002"}return"\u6587\u4EF6\u6682\u65F6\u65E0\u6CD5\u9884\u89C8\u3002\u8BF7\u91CD\u8BD5\uFF0C\u6216\u4E0B\u8F7D\u539F\u6587\u4EF6\u3002"}function qD({file:e,number:t}){let[a,n]=(0,Ze.useState)(0),[l,r]=(0,Ze.useState)(!1);return l?(0,V.jsxs)("div",{className:"preview-page-error",children:[(0,V.jsxs)("p",{children:["\u7B2C ",t," \u9875\u52A0\u8F7D\u5931\u8D25"]}),(0,V.jsx)(_,{onClick:()=>{r(!1),n(o=>o+1)},children:"\u91CD\u8BD5\u6B64\u9875"})]}):(0,V.jsx)("img",{src:`${or(e)}?view=page&page=${t}&attempt=${a}`,loading:t===1?"eager":"lazy",decoding:"async",alt:`\u7B2C ${t} \u9875`,draggable:!1,onError:()=>r(!0)})}function I0({file:e,expanded:t,onExpand:a,onClose:n}){let{state:l,controller:r}=ce(),o=xo(l.thread?.messages);o.some(E=>E.id===e.id)||o.unshift(e);let[i,u]=(0,Ze.useState)(),[c,s]=(0,Ze.useState)(0),[f,d]=(0,Ze.useState)("fit"),[p,g]=(0,Ze.useState)(1),[y,w]=(0,Ze.useState)(500),x=(0,Ze.useRef)(null),m=(0,Ze.useRef)(null),h=(0,Ze.useRef)([]),L=(0,Ze.useRef)(new Map),I=i?.id===e.id?i.preview:void 0,C=i?.id===e.id?i.error:void 0,T=I?.kind==="pages"?I:void 0,N=T?T.width*4/3:816,P=Math.min(920,Math.max(200,y-(y<460?28:48))),k=f==="fit"?1:Number(f)/100,oe=f==="fit"?P:N*k;(0,Ze.useEffect)(()=>{let E=x.current;if(!E)return;let $=E.getRootNode().activeElement;return E.focus({preventScroll:!0}),()=>{$ instanceof HTMLElement&&$.isConnected&&$.focus({preventScroll:!0})}},[]),(0,Ze.useEffect)(()=>{let E=m.current;if(!E)return;let O=new ResizeObserver(([$])=>w($.contentRect.width));return O.observe(E),()=>O.disconnect()},[]),(0,Ze.useEffect)(()=>{let E=new AbortController;return Oe(Lh(e)+"?view=preview",{signal:E.signal}).then(O=>{E.signal.aborted||u({id:e.id,preview:O})}).catch(O=>{E.signal.aborted||u({id:e.id,error:ND(O)})}),()=>E.abort()},[e.id,e.jobId,c]),(0,Ze.useLayoutEffect)(()=>{let E=m.current;if(!E||!I)return;let O=L.current.get(e.id);E.scrollTop=O?.top||0,E.scrollLeft=O?.left||0,g(1)},[e.id,I]),(0,Ze.useEffect)(()=>{if(!T||!m.current)return;let E=m.current,O=0,$=()=>{let Nt=E.getBoundingClientRect().top+E.clientHeight*.36,qt=1;for(let[wt,Jt]of h.current.slice(0,T.pages).entries())Jt&&Jt.getBoundingClientRect().top<=Nt&&(qt=wt+1);let b=E.scrollHeight-E.clientHeight;g(b>2&&E.scrollTop>=b-2?T.pages:qt)},Ee=()=>{cancelAnimationFrame(O),O=requestAnimationFrame($)};return $(),E.addEventListener("scroll",Ee,{passive:!0}),()=>{cancelAnimationFrame(O),E.removeEventListener("scroll",Ee)}},[T,oe]);let ne=E=>{let O=h.current[E-1],$=m.current;!O||!$||($.scrollTop+=O.getBoundingClientRect().top-$.getBoundingClientRect().top-12,g(E))},z=E=>{let O=p;d(E),T&&requestAnimationFrame(()=>ne(O))};return(0,V.jsxs)("section",{className:"file-preview","aria-label":"\u6587\u4EF6\u9884\u89C8",children:[(0,V.jsxs)("header",{className:"file-preview-toolbar",children:[(0,V.jsxs)("label",{className:"file-preview-picker",title:e.filename,children:[(0,V.jsx)(Gc,{format:e.format,size:19}),(0,V.jsx)("select",{"aria-label":"\u5207\u6362\u9884\u89C8\u6587\u4EF6",ref:x,value:e.id,onChange:E=>{let O=o.find($=>$.id===E.target.value);O&&r.openFile(O)},children:o.map(E=>(0,V.jsx)("option",{value:E.id,children:E.filename},E.id))})]}),(0,V.jsxs)("div",{className:"file-preview-tools",children:[(0,V.jsxs)("select",{className:"file-preview-zoom","aria-label":"\u7F29\u653E\u9884\u89C8",value:f,disabled:!I,onChange:E=>z(E.target.value),children:[(0,V.jsx)("option",{value:"fit",children:"\u9002\u5E94\u5BBD\u5EA6"}),["50","70","100","125","150","200"].map(E=>(0,V.jsxs)("option",{value:E,children:[E,"%"]},E))]}),(0,V.jsx)("a",{className:"button icon-button","aria-label":"\u4E0B\u8F7D\u539F\u6587\u4EF6",title:"\u4E0B\u8F7D\u539F\u6587\u4EF6",href:or(e),download:e.filename,children:(0,V.jsx)($n,{size:17})}),(0,V.jsx)(K,{className:"desktop-only",label:t?"\u6062\u590D\u5206\u680F":"\u5C55\u5F00\u6587\u4EF6\u9884\u89C8",onClick:a,children:t?(0,V.jsx)(Pl,{size:17}):(0,V.jsx)(Ul,{size:17})}),(0,V.jsx)(K,{label:"\u5173\u95ED\u6587\u4EF6\u9884\u89C8",onClick:n,children:(0,V.jsx)(Re,{size:18})})]})]}),(0,V.jsx)("div",{className:"file-preview-canvas",ref:m,role:"region","aria-label":"\u6587\u4EF6\u5185\u5BB9",tabIndex:0,"aria-busy":!I&&!C,onScroll:E=>{let{scrollTop:O,scrollLeft:$}=E.currentTarget;I&&L.current.set(e.id,{top:O,left:$})},children:C?(0,V.jsxs)("div",{className:"file-preview-state",role:"status",children:[(0,V.jsx)(Gc,{format:e.format,size:29}),(0,V.jsx)("p",{children:C}),(0,V.jsxs)(_,{onClick:()=>{u(void 0),s(E=>E+1)},children:[(0,V.jsx)(gn,{size:15}),"\u91CD\u8BD5\u9884\u89C8"]})]}):I?(0,V.jsx)("div",{className:"file-preview-stack",children:I.kind==="pages"?Array.from({length:I.pages},(E,O)=>(0,V.jsx)("figure",{className:"file-paper",ref:$=>{h.current[O]=$},style:{width:oe,aspectRatio:I.width/I.height},children:(0,V.jsx)(qD,{file:e,number:O+1})},O)):I.kind==="html"?(0,V.jsx)("iframe",{className:"file-html-preview",title:e.filename,src:or(e)+"?view=html",sandbox:"",referrerPolicy:"no-referrer",style:{width:oe/k,zoom:k}}):(0,V.jsxs)("article",{className:"file-reading-sheet",style:{width:oe,fontSize:`${k}rem`},children:[I.truncated&&(0,V.jsx)("p",{className:"file-preview-limit",children:"\u4EC5\u663E\u793A\u90E8\u5206\u5185\u5BB9\uFF0C\u53EF\u4E0B\u8F7D\u539F\u6587\u4EF6\u9605\u8BFB\u5168\u6587\u3002"}),I.kind==="markdown"?(0,V.jsx)(w0,{text:I.text}):I.kind==="table"?(0,V.jsxs)("table",{children:[(0,V.jsx)("thead",{children:(0,V.jsx)("tr",{children:I.rows[0]?.map((E,O)=>(0,V.jsx)("th",{scope:"col",children:E},O))})}),(0,V.jsx)("tbody",{children:I.rows.slice(1).map((E,O)=>(0,V.jsx)("tr",{children:E.map(($,Ee)=>(0,V.jsx)("td",{children:$},Ee))},O))})]}):I.kind==="notebook"?I.cells.map((E,O)=>E.kind==="markdown"?(0,V.jsx)(w0,{text:E.source},O):(0,V.jsx)("pre",{children:(0,V.jsx)("code",{children:E.source})},O)):"text"in I&&(0,V.jsx)("pre",{children:I.text})]})},e.id):(0,V.jsxs)("div",{className:"file-preview-state",role:"status",children:[(0,V.jsx)(St,{className:"spin",size:22}),"\u6B63\u5728\u51C6\u5907\u9884\u89C8"]})}),(0,V.jsxs)("footer",{className:"file-preview-footer",children:[(0,V.jsxs)("span",{children:[Hc(e.format),e.size>0?` \xB7 ${_c(e.size)}`:""]}),T&&(0,V.jsxs)("div",{className:"file-page-controls",children:[(0,V.jsx)(K,{label:"\u4E0A\u4E00\u9875",disabled:p<=1,onClick:()=>ne(p-1),children:(0,V.jsx)(Ai,{size:16})}),(0,V.jsxs)("span",{"aria-live":"polite",children:[p," / ",T.pages]}),(0,V.jsx)(K,{label:"\u4E0B\u4E00\u9875",disabled:p>=T.pages,onClick:()=>ne(p+1),children:(0,V.jsx)(Rl,{size:16})})]})]})]})}var S=J(ye(),1);function A0({text:e}){let{controller:t,state:a}=ce();return(0,S.jsx)("div",{className:"markdown",children:(0,S.jsx)(ou,{remarkPlugins:[ho],skipHtml:!0,components:{a:({href:n,children:l})=>(0,S.jsx)("a",{href:go(n),target:"_blank",rel:"noopener noreferrer",onClick:r=>{if(r.button||r.altKey||r.metaKey||r.ctrlKey||r.shiftKey)return;let o=n&&xo(a.thread?.messages).find(u=>n===or(u));if(o){r.preventDefault(),t.openFile(o);return}let i=n?.match(/^\/teacher\/artifacts\/([^?#/]+)/);i&&(r.preventDefault(),t.openArtifact(decodeURIComponent(i[1])).catch(t.error))},children:l}),img:({src:n,alt:l})=>(0,S.jsx)("span",{className:"image-link",children:go(n)?(0,S.jsx)("a",{href:go(n),target:"_blank",rel:"noopener noreferrer",children:l||"\u67E5\u770B\u56FE\u7247"}):l})},children:e})})}function UD({message:e}){let{state:t,controller:a}=ce(),n=`aisecedu:requirements:${t.thread?.id}:${e.id}`,[l,r]=(0,Fe.useState)(()=>qc(n,{})),[o,i]=(0,Fe.useState)(0),[u,c]=(0,Fe.useState)(!1),s=(0,Fe.useRef)(null),f=e.metadata.questions||[];if((0,Fe.useEffect)(()=>{Uc(n,l)},[n,l]),(0,Fe.useEffect)(()=>{u&&s.current?.focus()},[u]),!f.length||e.metadata.pending)return null;if(e.metadata.questionReplyJobId)return(0,S.jsxs)("span",{className:"question-complete",children:[(0,S.jsx)(Bt,{size:14}),"\u9700\u6C42\u5DF2\u7B54\u590D"]});let d=f[o];if(!d)return null;let p=d.choices||[],g=l[d.id]||"",y=u||!p.length||!!(g&&!p.includes(g)),w=m=>{i(m),c(!1)},x=o===f.length-1;return(0,S.jsxs)("form",{className:"question-block",onSubmit:m=>{if(m.preventDefault(),!g.trim())return;if(!x){w(o+1);return}let h=f.findIndex(L=>!l[L.id]?.trim());if(h>=0){w(h);return}a.send({content:f.map(L=>l[L.id].trim()).join(`
`),questionReply:{sourceMessageId:e.id,answers:l}})},children:[(0,S.jsxs)("header",{className:"question-header",children:[(0,S.jsx)("strong",{children:"\u786E\u8BA4\u6559\u5B66\u9700\u6C42"}),f.length>1&&(0,S.jsxs)("span",{children:[o+1," / ",f.length]})]}),(0,S.jsxs)("fieldset",{children:[(0,S.jsx)("legend",{children:d.text}),p.length>0&&(0,S.jsx)("div",{className:"choice-list",children:p.map((m,h)=>(0,S.jsxs)("button",{className:g===m?"selected":"",type:"button","aria-pressed":g===m,onClick:()=>{r({...l,[d.id]:m}),c(!1)},children:[(0,S.jsx)("span",{className:"choice-indicator","aria-hidden":"true",children:g===m&&(0,S.jsx)(Bt,{size:13})}),(0,S.jsxs)("span",{children:[(0,S.jsx)("strong",{children:m}),d.descriptions?.[h]&&(0,S.jsx)("small",{children:d.descriptions[h]})]})]},m))}),y?(0,S.jsx)("textarea",{ref:s,"aria-label":d.text,placeholder:"\u586B\u5199\u4F60\u7684\u56DE\u7B54",value:p.includes(g)?"":g,onChange:m=>r({...l,[d.id]:m.target.value}),maxLength:750,required:!0,rows:2}):(0,S.jsx)("button",{type:"button",className:"question-custom",onClick:()=>{r({...l,[d.id]:""}),c(!0)},children:"\u81EA\u5DF1\u586B\u5199"})]},d.id),(0,S.jsxs)("footer",{children:[o>0&&(0,S.jsx)("button",{type:"button",className:"button",onClick:()=>w(o-1),children:"\u4E0A\u4E00\u4E2A"}),(0,S.jsx)("button",{type:"submit",className:"button primary",disabled:t.busy||!g.trim(),children:x?"\u63D0\u4EA4\u5E76\u7EE7\u7EED":"\u4E0B\u4E00\u4E2A"})]})]})}function PD({message:e}){let{state:t,controller:a}=ce(),n=e.metadata.generationOptions,[l,r]=(0,Fe.useState)(0),[o,i]=(0,Fe.useState)(!1),[u,c]=(0,Fe.useState)("");if(!n?.options?.length)return null;let s=n.options[Math.min(l,n.options.length-1)],f=e.metadata.generationSelection,d=f?.status==="STARTED",p=!!e.metadata.generationRefinement;return(0,S.jsxs)("section",{className:"options-block",children:[(0,S.jsxs)("header",{children:[(0,S.jsx)(ll,{size:16}),(0,S.jsx)("strong",{children:"\u751F\u6210\u65B9\u6848"}),(0,S.jsx)("span",{className:"quiet",children:"\u5BA1\u9605\u540E\u5F00\u59CB\u5236\u4F5C"})]}),(0,S.jsx)("div",{className:"option-tabs",role:"tablist","aria-label":"\u751F\u6210\u65B9\u6848",children:n.options.map((g,y)=>(0,S.jsxs)("button",{role:"tab","aria-selected":l===y,onClick:()=>r(y),children:["\u65B9\u6848 ",y+1,f?.optionId===g.id&&(0,S.jsx)(Bt,{size:12})]},g.id))}),(0,S.jsxs)("div",{className:"option-content",role:"tabpanel",children:[(0,S.jsx)("h3",{children:s.title}),(0,S.jsx)("p",{children:s.description}),(0,S.jsx)("ul",{children:(s.highlights||[]).map(g=>(0,S.jsx)("li",{children:g},g))}),(0,S.jsxs)("details",{children:[(0,S.jsx)("summary",{children:"\u67E5\u770B\u5B8C\u6574\u751F\u6210\u8981\u6C42"}),(0,S.jsx)(A0,{text:s.rewrittenPrompt||s.prompt||""})]}),(0,S.jsxs)(_,{className:"primary",disabled:t.busy||d||p,onClick:()=>n.artifactType==="ctf-challenge"?i(!0):void a.run(()=>a.selectOption(e.id,s.id)),children:[(0,S.jsx)(hn,{size:14}),d?"\u5DF2\u5F00\u59CB\u751F\u6210":p?"\u5DF2\u6709\u65B0\u65B9\u6848":"\u91C7\u7528\u6B64\u65B9\u6848"]})]}),!d&&!p&&(0,S.jsxs)("details",{className:"refine-options",children:[(0,S.jsx)("summary",{children:"\u8C03\u6574\u65B9\u6848\u8981\u6C42"}),(0,S.jsx)("textarea",{"aria-label":"\u65B9\u6848\u4FEE\u6539\u8981\u6C42",value:u,onChange:g=>c(g.target.value),placeholder:"\u8BF4\u660E\u9700\u8981\u4FDD\u7559\u548C\u8C03\u6574\u7684\u90E8\u5206",rows:2}),(0,S.jsx)(_,{disabled:!u.trim()||t.busy,onClick:()=>void a.run(async()=>{await Oe(`/threads/${me(t.thread.id)}/messages/${e.id}/generation-options/refine`,{method:"POST",key:rr(),body:{content:u}}),await a.refreshThread()}),children:"\u66F4\u65B0\u65B9\u6848"})]}),o&&(0,S.jsx)(S0,{bundle:n,option:s,messageId:e.id,onClose:()=>i(!1)})]})}function FD({message:e}){let{state:t,controller:a}=ce(),n=e.metadata.toolProposals||[];return e.metadata.pending!==!1?null:(0,S.jsx)(S.Fragment,{children:n.map((l,r)=>{if(l.tool==="classroom.prepare"){let u=t.thread;if(!u)return null;let c=zc(u,e,r),s=t.busy||t.loadingThread;return(0,S.jsxs)("section",{className:"approval-block",children:[(0,S.jsxs)("h3",{children:[(0,S.jsx)(no,{size:17}),"\u51C6\u5907\u8BFE\u5802"]}),(0,S.jsx)("p",{children:l.reason||"\u4F7F\u7528\u5DF2\u53D1\u5E03\u7684\u9759\u6001\u8BFE\u4EF6\u51C6\u5907\u8BFE\u5802\u3002"}),c?c.sessionId?(0,S.jsxs)(S.Fragment,{children:[(0,S.jsx)("p",{role:"status",children:"\u8BFE\u5802\u5DF2\u51C6\u5907\u3002\u5F00\u59CB\u4E0A\u8BFE\u9700\u8981\u6559\u5E08\u786E\u8BA4\u3002"}),(0,S.jsx)("a",{href:L0(u.id,c.sessionId),children:"\u67E5\u770B\u5DF2\u51C6\u5907\u7684\u8BFE\u5802"})]}):c.decision==="REJECTED"?(0,S.jsx)("p",{role:"status",children:"\u5DF2\u62D2\u7EDD\u8BFE\u5802\u51C6\u5907\u3002"}):c.decision==="APPROVED"?(0,S.jsx)(_,{className:"primary",disabled:s,onClick:()=>void a.run(()=>a.prepareClassroom(u.id,e.id,r)),children:"\u7EE7\u7EED\u51C6\u5907\u8BFE\u5802"}):(0,S.jsxs)(S.Fragment,{children:[(0,S.jsxs)("details",{children:[(0,S.jsx)("summary",{children:"\u67E5\u770B\u64CD\u4F5C\u8BE6\u60C5"}),(0,S.jsx)(va,{value:{tool:l.tool,arguments:l.arguments}})]}),(0,S.jsxs)("div",{className:"button-row",children:[(0,S.jsx)(_,{disabled:s,onClick:()=>void a.run(()=>a.prepareClassroom(u.id,e.id,r,"REJECTED")),children:"\u62D2\u7EDD"}),(0,S.jsx)(_,{className:"primary",disabled:s,onClick:()=>void a.run(()=>a.prepareClassroom(u.id,e.id,r,"APPROVED")),children:"\u6279\u51C6\u5E76\u51C6\u5907\u8BFE\u5802"})]})]}):(0,S.jsx)("p",{children:"\u8BF7\u8FD4\u56DE\u539F\u8BFE\u7A0B\u548C\u7AE0\u8282\u5E76\u6838\u5BF9\u63D0\u6848\u53CA\u6279\u51C6\u8BB0\u5F55\u3002"})]},r)}let o=e.metadata.toolProposalDecisions?.[String(r)],i=e.metadata.toolExecutionResults?.[String(r)];return!l.requiresConfirmation||o||i?.status==="SUCCEEDED"?null:(0,S.jsxs)("section",{className:"approval-block",children:[(0,S.jsxs)("h3",{children:[(0,S.jsx)(no,{size:17}),"\u9700\u8981\u4F60\u6279\u51C6"]}),(0,S.jsx)("p",{children:l.reason||l.tool}),(0,S.jsxs)("details",{children:[(0,S.jsx)("summary",{children:"\u67E5\u770B\u64CD\u4F5C\u8BE6\u60C5"}),(0,S.jsx)(va,{value:{tool:l.tool,arguments:l.arguments}})]}),(0,S.jsxs)("div",{className:"button-row",children:[(0,S.jsx)(_,{disabled:t.busy,onClick:()=>void a.run(()=>a.approve(e.id,r,"REJECTED")),children:"\u62D2\u7EDD"}),(0,S.jsx)(_,{className:"primary",disabled:t.busy,onClick:()=>void a.run(()=>a.approve(e.id,r,"APPROVED")),children:"\u6279\u51C6\u5E76\u7EE7\u7EED"})]})]},r)})})}function HD({message:e}){let{state:t,controller:a}=ce(),[n,l]=(0,Fe.useState)(!1),[r,o]=(0,Fe.useState)(null),i=e.metadata||{},u=t.jobs.find(h=>h.id===i.jobId),c=(0,Fe.useMemo)(()=>u?Ec(u.id,t.events[u.id]||[],nt(u)):[],[u?.id,u?.status,t.events]),s=c.filter(h=>h.kind==="message").map(h=>y0(h.content||"")).filter(Boolean).at(-1),f=Array.isArray(i.plan)?i.plan:[],d=i.pending===!0,p=!!(i.questions?.length&&!i.questionReplyJobId&&!d),g=d&&s?s:d?"":e.content,y=document.getElementById("cocreation-workbench")?.dataset.scopedTeaching==="true",w=i.questions?.length&&g==="\u6211\u9700\u8981\u786E\u8BA4\u4E00\u4E2A\u4F1A\u5F71\u54CD\u6210\u54C1\u7684\u9009\u62E9\u3002"?"":y&&e.role==="assistant"?Nc(g):g,x=[...c].reverse().find(h=>h.kind!=="message"&&h.kind!=="reasoning"),m=e.role==="user";return(0,S.jsxs)("article",{className:`message ${m?"user-message":"assistant-message"}`,"data-message-id":e.id,children:[(0,S.jsxs)("div",{className:"message-meta",children:[m?(0,S.jsx)("span",{className:"avatar user",children:String(t.context.user?.name||"\u6211").slice(0,1)}):(0,S.jsx)("span",{className:"avatar",children:(0,S.jsx)(pa,{size:15})}),(0,S.jsx)("strong",{children:m?"\u4F60":"\u7384\u7532"}),(0,S.jsx)("time",{children:Na(e.created)}),i.executionMode==="plan"&&(0,S.jsx)("span",{className:"tag",children:"\u89C4\u5212"})]}),(0,S.jsxs)("div",{className:"message-body",children:[f.length>0&&(0,S.jsxs)("details",{className:"plan-block",open:d||i.executionMode==="plan",children:[(0,S.jsxs)("summary",{children:[(0,S.jsx)(ll,{size:15}),"\u4EFB\u52A1\u8BA1\u5212",(0,S.jsxs)("span",{children:[f.length," \u9879"]})]}),(0,S.jsx)("ol",{children:f.map((h,L)=>(0,S.jsx)("li",{children:typeof h=="string"?h:h.title||h.description||h.step||JSON.stringify(h)},L))})]}),u&&(d||p||u.status==="FAILED"||u.status==="CANCELED")&&(0,S.jsxs)("button",{className:"run-summary",onClick:()=>a.selectJob(u.id),children:[(0,S.jsx)(Zt,{status:p?"WAITING_INPUT":u.status}),!p&&(0,S.jsx)("span",{children:x?.title||u.message||u.stage||"\u67E5\u770B\u6267\u884C\u8BB0\u5F55"}),(0,S.jsx)(ca,{size:14})]}),w&&(0,S.jsx)(A0,{text:w}),d&&!u&&(0,S.jsx)("p",{className:"quiet pending-text",role:"status",children:"\u6B63\u5728\u63A5\u6536\u8981\u6C42\u2026"}),i.executionMode==="plan"&&!d&&!i.failed&&!i.questions?.length&&(0,S.jsxs)(_,{className:"primary",disabled:t.busy,onClick:()=>void a.send({content:"\u6309\u8FD9\u4EFD\u8BA1\u5212\u6267\u884C\u3002",planSourceMessageId:e.id}),children:[(0,S.jsx)(hn,{size:14}),"\u6309\u6B64\u8BA1\u5212\u5236\u4F5C"]}),(0,S.jsx)(UD,{message:e}),(0,S.jsx)(PD,{message:e}),(0,S.jsx)(FD,{message:e}),(e.cards||[]).map(h=>{let L=h.type==="artifact"||h.objectType==="artifact"?h.objectId:null,I=h.type==="candidate-set"||h.objectType==="candidate-set"||h.objectType==="candidate_set"?h.objectId:null,C=h.type==="job"||h.objectType==="job"?h.objectId:null,T=go(h.state?.href);return(0,S.jsxs)("button",{className:"result-card",disabled:!L&&!I&&!C&&!T,onClick:()=>L?void a.openArtifact(L).catch(a.error):I?o(I):C?a.selectJob(C):T&&window.open(T,"_blank","noopener"),children:[(0,S.jsx)("span",{className:"result-glyph","aria-hidden":"true",children:h.state?.artifactType==="simulation"?(0,S.jsx)(hn,{size:18}):(0,S.jsx)(Ge,{size:19})}),(0,S.jsxs)("span",{children:[(0,S.jsx)("small",{children:L?h.state?.artifactType==="simulation"?"\u52A8\u6001\u4EFF\u771F":h.state?.artifactType==="slide-deck"?"\u8BFE\u4EF6":"\u751F\u6210\u6210\u54C1":I?h.state?.kind==="slide-deck"?"\u8BFE\u4EF6\u65B9\u6848":"\u751F\u6210\u7ED3\u679C":h.title||"\u4EFB\u52A1\u7ED3\u679C"}),(0,S.jsx)("strong",{children:h.title||h.state?.title||"\u67E5\u770B\u5185\u5BB9"}),(0,S.jsx)("span",{children:h.subtitle||(L&&h.state?.status==="READY"?"\u6253\u5F00\u9884\u89C8":h.state?.status||"")})]}),(0,S.jsx)(ca,{size:16})]},h.id||h.objectId)}),(i.files||[]).map(h=>{let L=yh(h);if(!L){let C=go(h.downloadUrl);return C&&(0,S.jsxs)("a",{className:"file-result",href:C,download:h.filename,children:[(0,S.jsx)($n,{size:16}),h.filename]},h.id||C)}let I=t.panel==="files"&&t.panelOpen&&t.selectedFile?.id===L.id;return(0,S.jsxs)("div",{className:"conversation-file","data-active":I,children:[(0,S.jsxs)("button",{type:"button",className:"conversation-file-open","aria-label":`\u9884\u89C8 ${L.filename}`,"aria-expanded":I,"aria-controls":I?"workbench-file-preview":void 0,onClick:()=>a.openFile(L),children:[(0,S.jsx)("span",{className:"conversation-file-icon",children:(0,S.jsx)(Gc,{format:L.format})}),(0,S.jsxs)("span",{className:"conversation-file-name",children:[(0,S.jsx)("strong",{title:L.filename,children:L.filename}),(0,S.jsxs)("small",{children:[Hc(L.format),L.size>0?` \xB7 ${_c(L.size)}`:""]})]})]}),(0,S.jsx)("a",{className:"button icon-button",href:or(L),download:L.filename,"aria-label":`\u4E0B\u8F7D ${L.filename}`,title:"\u4E0B\u8F7D\u539F\u6587\u4EF6",children:(0,S.jsx)($n,{size:16})})]},L.id)}),!d&&(0,S.jsxs)("div",{className:"message-actions",children:[(0,S.jsx)(K,{label:n?"\u5DF2\u590D\u5236":"\u590D\u5236\u6D88\u606F",onClick:()=>{navigator.clipboard.writeText(w).then(()=>{l(!0),setTimeout(()=>l(!1),1600)}).catch(a.error)},children:n?(0,S.jsx)(Bt,{size:14}):(0,S.jsx)(Ol,{size:14})}),!m&&(0,S.jsx)(K,{label:"\u4ECE\u5F53\u524D\u4F1A\u8BDD\u521B\u5EFA\u5206\u652F",onClick:()=>void a.run(()=>a.fork(t.thread.id)),children:(0,S.jsx)(dn,{size:14})})]})]}),r&&(0,S.jsx)(Bc,{candidateSetId:r,close:()=>o(null)})]})}function _D(){let{state:e,controller:t}=ce(),a=[{title:"\u4EA4\u4E92\u6F14\u793A",subtitle:"\u8BA9\u5B66\u751F\u64CD\u4F5C\u3001\u51B3\u7B56\u4E0E\u89C2\u5BDF",icon:_l,type:"simulation",prompt:"\u5236\u4F5C\u4E00\u4E2A\u53EF\u4EE5\u76F4\u63A5\u7528\u4E8E\u8BFE\u5802\u7684\u4EA4\u4E92\u6F14\u793A\u3002\u5B66\u751F\u9700\u8981\u901A\u8FC7\u8C03\u6574\u53C2\u6570\u3001\u505A\u51FA\u51B3\u7B56\u5E76\u89C2\u5BDF\u540E\u679C\u6765\u638C\u63E1\u77E5\u8BC6\u3002\u4E3B\u9898\uFF1A"},{title:"\u6559\u5B66\u8BFE\u4EF6",subtitle:"\u5185\u5BB9\u3001\u8BB2\u7A3F\u4E0E\u8BFE\u5802\u4E92\u52A8",icon:Ge,type:"slide-deck",prompt:"\u5E2E\u6211\u5236\u4F5C\u4E00\u4EFD\u53EF\u4EE5\u76F4\u63A5\u6388\u8BFE\u7684\u8BFE\u4EF6\uFF0C\u5305\u542B\u8BB2\u7A3F\u4E0E\u8BFE\u5802\u4E92\u52A8\u3002\u4E3B\u9898\uFF1A"},{title:"CTF \u5B9E\u8DF5\u9898",subtitle:"\u72EC\u7ACB\u73AF\u5883\u4E0E\u771F\u5B9E\u7EC3\u4E60",icon:Vl,type:"auto",prompt:"\u8BBE\u8BA1\u4E00\u7EC4 CTF \u5B9E\u8DF5\u9898\uFF0C\u5305\u542B\u53EF\u8FD0\u884C\u73AF\u5883\u3001\u5206\u5C42\u63D0\u793A\u548C\u9A8C\u8BC1\u3002\u4E3B\u9898\uFF1A"}],n=document.getElementById("cocreation-workbench")?.dataset.scopedTeaching==="true",l=n?Oc(e)?uu.map((r,o)=>({...r,type:"auto",icon:[fa,_l,Ge][o]})):[{title:"\u6559\u6848\u4E0E\u8BB2\u4E49",subtitle:"\u751F\u6210\u53EF\u4E0B\u8F7D\u7684 Word \u8349\u7A3F",icon:Ge,type:"auto",prompt:"\u8BF7\u751F\u6210\u4E00\u4EFD Word \u6559\u6848\uFF0C\u5305\u542B\u6559\u5B66\u76EE\u6807\u3001\u8BFE\u5802\u6D3B\u52A8\u548C\u5C0F\u7ED3\u3002\u4E3B\u9898\uFF1A"},{title:"\u8BFE\u5802\u7EC3\u4E60",subtitle:"\u7F16\u5199\u9898\u76EE\u3001\u7B54\u6848\u548C\u8BB2\u89E3",icon:_l,type:"auto",prompt:"\u8BF7\u751F\u6210\u4E00\u4EFD Markdown \u8BFE\u5802\u7EC3\u4E60\u6587\u6863\uFF0C\u5305\u542B\u4E09\u9053\u9898\u3001\u53C2\u8003\u7B54\u6848\u548C\u8BB2\u89E3\u3002\u4E3B\u9898\uFF1A"},{title:"\u8BFE\u4EF6\u63D0\u7EB2",subtitle:"\u7EC4\u7EC7\u5404\u9875\u91CD\u70B9\u548C\u8BB2\u6388\u987A\u5E8F",icon:fa,type:"auto",prompt:"\u8BF7\u5236\u4F5C\u4E00\u4EFD Word \u6559\u5B66\u8BB2\u4E49\uFF0C\u6309\u4E94\u5F20\u5E7B\u706F\u7247\u7684\u987A\u5E8F\u7F16\u6392\u6807\u9898\u3001\u8981\u70B9\u548C\u8BB2\u89E3\u63D0\u793A\u3002\u4E3B\u9898\uFF1A"}]:a;return(0,S.jsxs)("div",{className:"conversation",children:[(0,S.jsx)("div",{className:"transcript-scroll",children:(0,S.jsxs)("div",{className:"welcome",children:[(0,S.jsxs)("div",{className:"welcome-heading",children:[(0,S.jsx)("span",{className:"welcome-symbol",children:(0,S.jsx)(pa,{size:24})}),(0,S.jsx)("h1",{children:"\u4ECA\u5929\uFF0C\u4E00\u8D77\u505A\u51FA\u4EC0\u4E48\uFF1F"}),(0,S.jsx)("p",{children:"\u4ECE\u4E00\u4E2A\u6559\u5B66\u60F3\u6CD5\uFF0C\u5230\u53EF\u4EE5\u76F4\u63A5\u4F7F\u7528\u7684\u8BFE\u5802\u6210\u54C1\u3002"})]}),(0,S.jsx)("div",{className:"starter-grid",children:l.map(r=>(0,S.jsxs)(_,{onClick:()=>{t.setDraft({text:r.prompt,artifactType:r.type,...n?{learningPattern:""}:{}}),window.dispatchEvent(new Event("workbench-focus-composer"))},children:[(0,S.jsx)(r.icon,{size:18}),(0,S.jsxs)("span",{children:[(0,S.jsx)("strong",{children:r.title}),(0,S.jsx)("small",{children:r.subtitle})]})]},r.title))}),(0,S.jsxs)("section",{className:"recent-work",children:[(0,S.jsxs)("header",{children:[(0,S.jsx)("h2",{children:"\u7EE7\u7EED\u521B\u4F5C"}),(0,S.jsxs)(_,{onClick:()=>t.setPanel("artifacts"),children:["\u5168\u90E8\u6210\u54C1",(0,S.jsx)(ca,{size:13})]})]}),e.artifacts.slice(0,4).map(r=>(0,S.jsxs)("button",{onClick:()=>void t.openArtifact(r.id).catch(t.error),children:[(0,S.jsx)(Ge,{size:16}),(0,S.jsx)("strong",{children:r.title}),(0,S.jsxs)("span",{children:["V",r.currentRevision]}),(0,S.jsx)("small",{children:Na(r.updated)}),(0,S.jsx)(ca,{size:14})]},r.id)),!e.artifacts.length&&(0,S.jsx)("p",{className:"quiet",children:"\u751F\u6210\u7684\u8BFE\u4EF6\u3001\u6F14\u793A\u548C\u9898\u76EE\u4F1A\u4FDD\u5B58\u5728\u8FD9\u91CC\uFF0C\u968F\u65F6\u7EE7\u7EED\u4FEE\u6539\u3002"})]})]})}),(0,S.jsx)(xh,{welcome:!0})]})}function T0(){let{state:e}=ce(),t=(0,Fe.useRef)(null),a=(0,Fe.useRef)(null),n=(0,Fe.useRef)(!0),[l,r]=(0,Fe.useState)(!1),o=e.thread?.messages||[];return(0,Fe.useEffect)(()=>{n.current&&a.current?.scrollIntoView({block:"end"})},[o,e.events]),(0,Fe.useEffect)(()=>{n.current=!0,r(!1),a.current?.scrollIntoView({block:"end"})},[e.thread?.id]),!e.thread||!o.length?(0,S.jsx)(_D,{}):(0,S.jsxs)("div",{className:"conversation",children:[(0,S.jsx)("div",{ref:t,className:"transcript-scroll",onScroll:()=>{let i=t.current;n.current=i.scrollHeight-i.scrollTop-i.clientHeight<140,r(!n.current)},children:(0,S.jsxs)("div",{className:"transcript",children:[o.filter(i=>!i.metadata?.hidden).map(i=>(0,S.jsx)(HD,{message:i},i.id)),(0,S.jsx)("div",{ref:a})]})}),l&&(0,S.jsxs)(_,{className:"jump-latest",onClick:()=>{n.current=!0,a.current?.scrollIntoView({behavior:"smooth",block:"end"})},children:[(0,S.jsx)(ki,{size:14}),"\u56DE\u5230\u6700\u65B0"]}),(0,S.jsx)(xh,{})]})}var Vc=J(je(),1);var re=J(ye(),1);function D0(){let{state:e,controller:t}=ce(),[a,n]=(0,Vc.useState)("all"),[l,r]=(0,Vc.useState)(""),[o,i]=(0,Vc.useState)(null),u=e.jobs.filter(c=>(!l||`${c.title||""} ${c.kind} ${c.id}`.toLowerCase().includes(l.toLowerCase()))&&(a==="all"||a==="running"&&!nt(c)||a==="failed"&&["FAILED","CANCELED"].includes(c.status)||a==="done"&&c.status==="SUCCEEDED"));return(0,re.jsxs)("section",{className:"task-center",children:[(0,re.jsxs)("header",{children:[(0,re.jsxs)("div",{children:[(0,re.jsx)(Ra,{size:23}),(0,re.jsx)("h1",{children:"\u4EFB\u52A1\u4E2D\u5FC3"})]}),(0,re.jsx)("p",{children:"\u4EFB\u52A1\u5728\u540E\u53F0\u6301\u7EED\u6267\u884C\u3002\u53EF\u4EE5\u67E5\u770B\u8BB0\u5F55\u3001\u8865\u5145\u8981\u6C42\u6216\u4ECE\u4FDD\u7559\u7ED3\u679C\u7EE7\u7EED\u3002"})]}),(0,re.jsxs)("div",{className:"task-filters",children:[(0,re.jsx)("div",{className:"segmented",children:[["all","\u5168\u90E8"],["running","\u8FDB\u884C\u4E2D"],["failed","\u9700\u5904\u7406"],["done","\u5DF2\u5B8C\u6210"]].map(([c,s])=>(0,re.jsx)("button",{"aria-pressed":a===c,onClick:()=>n(c),children:s},c))}),(0,re.jsxs)("label",{className:"search-field",children:[(0,re.jsx)(da,{size:14}),(0,re.jsx)("input",{"aria-label":"\u641C\u7D22\u4EFB\u52A1",placeholder:"\u641C\u7D22\u4EFB\u52A1\u2026",value:l,onChange:c=>r(c.target.value)})]})]}),(0,re.jsxs)("div",{className:"task-list",children:[u.map(c=>(0,re.jsxs)("article",{className:"task-row",children:[(0,re.jsx)("div",{className:"task-icon",children:(0,re.jsx)(sa,{size:18})}),(0,re.jsxs)("div",{className:"task-info",children:[(0,re.jsx)("strong",{children:c.title||_i[c.kind]||c.kind}),(0,re.jsx)("p",{children:c.message||c.stage||"\u5DF2\u4FDD\u5B58\u6267\u884C\u8BB0\u5F55"}),(0,re.jsxs)("small",{children:[Na(c.created)," ",c.id.slice(0,8)]}),c.error&&(0,re.jsxs)("details",{children:[(0,re.jsx)("summary",{children:"\u67E5\u770B\u5931\u8D25\u539F\u56E0"}),(0,re.jsx)("pre",{children:typeof c.error=="string"?c.error:JSON.stringify(c.error,null,2)})]})]}),(0,re.jsx)(Zt,{status:c.status}),(0,re.jsxs)("div",{className:"task-actions",children:[c.status==="SUCCEEDED"&&c.kind==="candidate.generate"&&c.artifactType==="debate"&&c.resultTarget?.kind==="candidate"&&c.resultTarget.candidateSetId&&(0,re.jsx)(_,{onClick:()=>i(c.resultTarget.candidateSetId),children:"\u67E5\u770B\u8FA9\u8BBA\u5019\u9009"}),(0,re.jsx)(K,{label:"\u67E5\u770B\u6267\u884C\u8FC7\u7A0B",onClick:()=>t.selectJob(c.id),children:(0,re.jsx)(sa,{size:15})}),c.threadId&&(0,re.jsx)(K,{label:"\u56DE\u5230\u4EFB\u52A1\u4F1A\u8BDD",onClick:()=>void t.activate(c.threadId).catch(t.error),children:(0,re.jsx)(pn,{size:15})}),["FAILED","CANCELED"].includes(c.status)&&(0,re.jsxs)(_,{disabled:e.busy,onClick:()=>void t.run(()=>t.retry(c.id)),children:[(0,re.jsx)(gn,{size:14}),"\u7EE7\u7EED"]}),!nt(c)&&(0,re.jsx)(K,{label:"\u505C\u6B62\u4EFB\u52A1",disabled:e.busy,onClick:()=>void t.run(()=>t.cancel(c.id)),children:(0,re.jsx)(Gl,{size:14})})]})]},c.id)),!u.length&&(0,re.jsx)(qa,{icon:(0,re.jsx)(Ra,{size:28}),title:"\u8FD9\u91CC\u6CA1\u6709\u5339\u914D\u7684\u4EFB\u52A1",children:(0,re.jsx)("p",{children:"\u63D0\u4EA4\u521B\u4F5C\u8981\u6C42\u540E\uFF0C\u4EFB\u52A1\u548C\u6267\u884C\u72B6\u6001\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002"})})]}),(0,re.jsxs)("p",{className:"quiet task-limit",children:["\u663E\u793A\u6700\u8FD1 ",e.jobs.length," \u9879\u4EFB\u52A1"]}),o&&(0,re.jsx)(Bc,{candidateSetId:o,close:()=>i(null)},o)]})}var su=J(je(),1);var H=J(ye(),1);function GD(){let{state:e,controller:t}=ce(),[a,n]=(0,su.useState)(""),l=()=>t.patch({modal:null}),r=[{label:"\u65B0\u5EFA\u4F1A\u8BDD",shortcut:"Alt N",icon:ht,action:()=>t.newThread()},{label:"\u6253\u5F00\u4EFB\u52A1\u4E2D\u5FC3",shortcut:"",icon:Ra,action:()=>t.patch({taskCenter:!0})},{label:"\u5207\u6362\u53F3\u4FA7\u5DE5\u4F5C\u533A",shortcut:"\u2318 \u21E7 \\",icon:Fl,action:()=>t.togglePanel()},{label:"\u5916\u89C2\u4E0E\u8BBE\u7F6E",shortcut:"",icon:Ui,action:()=>t.patch({modal:"settings"})}],o=i=>i.toLowerCase().includes(a.toLowerCase());return(0,H.jsxs)(ma,{title:"\u641C\u7D22\u4E0E\u547D\u4EE4",onClose:l,children:[(0,H.jsxs)("label",{className:"command-search",children:[(0,H.jsx)(da,{size:18}),(0,H.jsx)("input",{autoFocus:!0,"aria-label":"\u641C\u7D22\u4F1A\u8BDD\u6216\u547D\u4EE4",placeholder:"\u641C\u7D22\u4F1A\u8BDD\u3001\u6210\u54C1\u6216\u64CD\u4F5C\u2026",value:a,onChange:i=>n(i.target.value)})]}),(0,H.jsxs)("div",{className:"command-results",children:[(0,H.jsx)("h3",{children:"\u64CD\u4F5C"}),r.filter(i=>o(i.label)).map(i=>(0,H.jsxs)(_,{onClick:()=>{l(),i.action()},children:[(0,H.jsx)(i.icon,{size:16}),i.label,(0,H.jsx)("kbd",{children:i.shortcut})]},i.label)),(0,H.jsx)("h3",{children:"\u4F1A\u8BDD"}),e.threads.filter(i=>o(i.title+" "+(i.latestMessage||""))).slice(0,12).map(i=>(0,H.jsxs)(_,{onClick:()=>{l(),t.activate(i.id).catch(t.error)},children:[(0,H.jsx)(pn,{size:16}),(0,H.jsx)("span",{children:i.title})]},i.id)),a&&(0,H.jsx)(_,{onClick:()=>{t.filterThreads(a),l(),t.patch({sidebarOpen:!0})},children:"\u641C\u7D22\u6240\u6709\u4F1A\u8BDD\u7684\u5B8C\u6574\u5185\u5BB9"}),(0,H.jsx)("h3",{children:"\u6210\u54C1"}),e.artifacts.filter(i=>o(i.title)).slice(0,8).map(i=>(0,H.jsxs)(_,{onClick:()=>{l(),t.openArtifact(i.id).catch(t.error)},children:[(0,H.jsx)(Ge,{size:16}),(0,H.jsx)("span",{children:i.title})]},i.id))]})]})}function VD({kind:e}){let{state:t,controller:a}=ce(),[n,l]=(0,su.useState)(""),r=e==="sources"?t.materials:t.skills,o=new Set(e==="sources"?t.draft.sources.map(i=>i.id):t.draft.skills);return(0,H.jsxs)(ma,{title:e==="sources"?"\u5F15\u7528\u8D44\u6599\u5E93":"\u9009\u62E9\u6280\u80FD",onClose:()=>a.patch({modal:null}),children:[(0,H.jsxs)("label",{className:"command-search",children:[(0,H.jsx)(da,{size:17}),(0,H.jsx)("input",{autoFocus:!0,"aria-label":"\u641C\u7D22\u8D44\u6599\u6216\u6280\u80FD",placeholder:"\u641C\u7D22\u2026",value:n,onChange:i=>l(i.target.value)})]}),(0,H.jsxs)("div",{className:"catalog-list",children:[r.filter(i=>`${i.name||i.title||i.filename||""} ${i.description||""}`.toLowerCase().includes(n.toLowerCase())).map(i=>{let u=String(e==="sources"?i.id:i.name),c=i.name||i.title||i.filename||u;return(0,H.jsxs)("button",{className:`catalog-item ${o.has(u)?"selected":""}`,"aria-pressed":o.has(u),onClick:()=>{e==="sources"?a.setDraft({sources:o.has(u)?t.draft.sources.filter(s=>s.id!==u):[...t.draft.sources,{id:u,name:c,type:"material"}]}):a.setDraft({skills:o.has(u)?t.draft.skills.filter(s=>s!==u):[...t.draft.skills,u]})},children:[e==="sources"?(0,H.jsx)(za,{size:18}):(0,H.jsx)(Rt,{size:18}),(0,H.jsxs)("span",{children:[(0,H.jsx)("strong",{children:c}),(0,H.jsx)("small",{children:i.description||i.status||i.mimeType})]}),(0,H.jsx)("span",{className:"check-box",children:o.has(u)&&(0,H.jsx)(Bt,{size:13})})]},u)}),!r.length&&(0,H.jsxs)(qa,{title:e==="sources"?"\u8FD8\u6CA1\u6709\u53EF\u5F15\u7528\u7684\u8D44\u6599":"\u6B63\u5728\u8BFB\u53D6\u6280\u80FD\u76EE\u5F55",children:[(0,H.jsx)("p",{children:e==="sources"?"\u53EF\u4EE5\u5728\u8F93\u5165\u533A\u4E0A\u4F20\u6587\u6863\uFF0C\u6216\u5230\u8D44\u6599\u5E93\u6DFB\u52A0\u3002":"\u76EE\u5F55\u4E0D\u53EF\u7528\u65F6\uFF0C\u53EF\u4EE5\u91CD\u8BD5\u8BFB\u53D6\u3002"}),(0,H.jsx)(_,{onClick:()=>void a.loadCatalog(e,!0).catch(a.error),children:"\u91CD\u65B0\u8BFB\u53D6"})]})]}),(0,H.jsxs)("div",{className:"dialog-actions",children:[(0,H.jsxs)("span",{className:"quiet",children:["\u5DF2\u9009 ",o.size," \u9879"]}),(0,H.jsx)(_,{className:"primary",onClick:()=>a.patch({modal:null}),children:"\u5B8C\u6210\u9009\u62E9"})]})]})}function jD(){let{state:e,controller:t}=ce(),[a,n]=(0,su.useState)(document.documentElement.dataset.aiseceduAppearance||"light"),[l,r]=(0,su.useState)(document.documentElement.dataset.aiseceduPalette||"academy");return(0,H.jsxs)(ma,{title:"\u5DE5\u4F5C\u53F0\u8BBE\u7F6E",onClose:()=>t.patch({modal:null}),children:[(0,H.jsxs)("div",{className:"dialog-body",children:[(0,H.jsx)("h3",{children:"\u5916\u89C2"}),(0,H.jsx)("div",{className:"appearance-options",children:[{key:"light",label:"\u6D45\u8272",Icon:Pi},{key:"dark",label:"\u6DF1\u8272",Icon:Oi},{key:"system",label:"\u8DDF\u968F\u7CFB\u7EDF",Icon:Ri}].map(o=>(0,H.jsxs)(_,{className:a===o.key?"selected":"",onClick:()=>n(o.key),children:[(0,H.jsx)(o.Icon,{size:19}),o.label]},o.key))}),(0,H.jsxs)("label",{className:"field",children:["\u6D45\u8272\u914D\u8272",(0,H.jsxs)("select",{value:l==="midnight"?"academy":l,onChange:o=>r(o.target.value),children:[(0,H.jsx)("option",{value:"academy",children:"\u5B66\u9662\u84DD"}),(0,H.jsx)("option",{value:"forest",children:"\u68EE\u6797\u7EFF"}),(0,H.jsx)("option",{value:"sunrise",children:"\u65E5\u51FA\u6696\u8272"})]})]}),(0,H.jsx)("h3",{children:"\u5FEB\u6377\u952E"}),(0,H.jsxs)("dl",{className:"shortcuts",children:[(0,H.jsx)("dt",{children:"\u641C\u7D22\u4E0E\u547D\u4EE4"}),(0,H.jsx)("dd",{children:"Ctrl / \u2318 K"}),(0,H.jsx)("dt",{children:"\u65B0\u5EFA\u4F1A\u8BDD"}),(0,H.jsx)("dd",{children:"Alt N"}),(0,H.jsx)("dt",{children:"\u5207\u6362\u5DE5\u4F5C\u533A"}),(0,H.jsx)("dd",{children:"Ctrl / \u2318 Shift \\"}),(0,H.jsx)("dt",{children:"\u591A\u884C\u8F93\u5165"}),(0,H.jsx)("dd",{children:"Shift Enter"}),(0,H.jsx)("dt",{children:"\u5207\u6362\u6392\u961F / \u4E0B\u4E00\u6B65\u8865\u5145"}),(0,H.jsx)("dd",{children:"Ctrl / \u2318 Enter"})]}),(0,H.jsx)("p",{className:"quiet",children:"\u4EFB\u52A1\u7531\u670D\u52A1\u5668\u6301\u7EED\u8FD0\u884C\uFF1B\u5173\u95ED\u9875\u9762\u4E0D\u4F1A\u4E22\u5931\u6267\u884C\u8FDB\u5EA6\u3002"})]}),(0,H.jsxs)("div",{className:"dialog-actions",children:[(0,H.jsx)(_,{onClick:()=>t.patch({modal:null}),children:"\u5173\u95ED"}),(0,H.jsx)(_,{className:"primary",disabled:e.busy,onClick:()=>void t.run(async()=>{await t.saveAppearance(a,a==="dark"?"midnight":l==="midnight"?"academy":l),t.patch({modal:null})}),children:"\u4FDD\u5B58\u5916\u89C2"})]})]})}function M0(){let{state:e}=ce();return e.modal==="search"?(0,H.jsx)(GD,{}):e.modal==="sources"||e.modal==="skills"?(0,H.jsx)(VD,{kind:e.modal}):e.modal==="settings"?(0,H.jsx)(jD,{}):null}var pt=J(je(),1);var cu=class{diff(t,a,n={}){let l;typeof n=="function"?(l=n,n={}):"callback"in n&&(l=n.callback);let r=this.castInput(t,n),o=this.castInput(a,n),i=this.removeEmpty(this.tokenize(r,n)),u=this.removeEmpty(this.tokenize(o,n));return this.diffWithOptionsObj(i,u,n,l)}diffWithOptionsObj(t,a,n,l){var r;let o=m=>{if(m=this.postProcess(m,n),l){setTimeout(function(){l(m)},0);return}else return m},i=a.length,u=t.length,c=1,s=i+u;n.maxEditLength!=null&&(s=Math.min(s,n.maxEditLength));let f=(r=n.timeout)!==null&&r!==void 0?r:1/0,d=Date.now()+f,p=[{oldPos:-1,lastComponent:void 0}],g=this.extractCommon(p[0],a,t,0,n);if(p[0].oldPos+1>=u&&g+1>=i)return o(this.buildValues(p[0].lastComponent,a,t));let y=-1/0,w=1/0,x=()=>{for(let m=Math.max(y,-c);m<=Math.min(w,c);m+=2){let h,L=p[m-1],I=p[m+1];L&&(p[m-1]=void 0);let C=!1;if(I){let N=I.oldPos-m;C=I&&0<=N&&N<i}let T=L&&L.oldPos+1<u;if(!C&&!T){p[m]=void 0;continue}if(!T||C&&L.oldPos<I.oldPos?h=this.addToPath(I,!0,!1,0,n):h=this.addToPath(L,!1,!0,1,n),g=this.extractCommon(h,a,t,m,n),h.oldPos+1>=u&&g+1>=i)return o(this.buildValues(h.lastComponent,a,t))||!0;p[m]=h,h.oldPos+1>=u&&(w=Math.min(w,m-1)),g+1>=i&&(y=Math.max(y,m+1))}c++};if(l)(function m(){setTimeout(function(){if(c>s||Date.now()>d)return l(void 0);x()||m()},0)})();else for(;c<=s&&Date.now()<=d;){let m=x();if(m)return m}}addToPath(t,a,n,l,r){let o=t.lastComponent;return o&&!r.oneChangePerToken&&o.added===a&&o.removed===n?{oldPos:t.oldPos+l,lastComponent:{count:o.count+1,added:a,removed:n,previousComponent:o.previousComponent}}:{oldPos:t.oldPos+l,lastComponent:{count:1,added:a,removed:n,previousComponent:o}}}extractCommon(t,a,n,l,r){let o=a.length,i=n.length,u=t.oldPos,c=u-l,s=0;for(;c+1<o&&u+1<i&&this.equals(n[u+1],a[c+1],r);)c++,u++,s++,r.oneChangePerToken&&(t.lastComponent={count:1,previousComponent:t.lastComponent,added:!1,removed:!1});return s&&!r.oneChangePerToken&&(t.lastComponent={count:s,previousComponent:t.lastComponent,added:!1,removed:!1}),t.oldPos=u,c}equals(t,a,n){return n.comparator?n.comparator(t,a):t===a||!!n.ignoreCase&&t.toLowerCase()===a.toLowerCase()}removeEmpty(t){let a=[];for(let n=0;n<t.length;n++)t[n]&&a.push(t[n]);return a}castInput(t,a){return t}tokenize(t,a){return Array.from(t)}join(t){return t.join("")}postProcess(t,a){return t}get useLongestToken(){return!1}buildValues(t,a,n){let l=[],r;for(;t;)l.push(t),r=t.previousComponent,delete t.previousComponent,t=r;l.reverse();let o=l.length,i=0,u=0,c=0;for(;i<o;i++){let s=l[i];if(s.removed)s.value=this.join(n.slice(c,c+s.count)),c+=s.count;else{if(!s.added&&this.useLongestToken){let f=a.slice(u,u+s.count);f=f.map(function(d,p){let g=n[c+p];return g.length>d.length?g:d}),s.value=this.join(f)}else s.value=this.join(a.slice(u,u+s.count));u+=s.count,s.added||(c+=s.count)}}return l}};var bh=class extends cu{constructor(){super(...arguments),this.tokenize=XD}equals(t,a,n){return n.ignoreWhitespace?((!n.newlineIsToken||!t.includes(`
`))&&(t=t.trim()),(!n.newlineIsToken||!a.includes(`
`))&&(a=a.trim())):n.ignoreNewlineAtEof&&!n.newlineIsToken&&(t.endsWith(`
`)&&(t=t.slice(0,-1)),a.endsWith(`
`)&&(a=a.slice(0,-1))),super.equals(t,a,n)}},E0=new bh;function vh(e,t,a){return E0.diff(e,t,a)}function XD(e,t){t.stripTrailingCr&&(e=e.replace(/\r\n/g,`
`));let a=[],n=e.split(/(\n|\r\n)/);n[n.length-1]||n.pop();for(let l=0;l<n.length;l++){let r=n[l];l%2&&!t.newlineIsToken?a[a.length-1]+=r:a.push(r)}return a}var B=J(ye(),1),z0=String.raw`第\s*[1-9]\d{0,2}\s*页(?:的)?\s*(?:原有|原|旧|现有)?(?:讲者备注|演讲备注|演讲稿|讲稿)`,B0="(?:\u6539\u5199|\u91CD\u5199|\u91CD\u65B0\u64B0\u5199|\u91CD\u65B0\u5199|\u8865\u5199|\u6DA6\u8272|\u7F29\u77ED|\u7F29\u51CF|\u6539\u77ED|\u7CBE\u7B80|\u538B\u7F29|\u6D53\u7F29|\u7B80\u5316|\u6821\u5BF9|\u4FEE\u6539|\u4FEE\u8BA2|\u4F18\u5316|\u8C03\u6574)",QD=new RegExp(String.raw`^\s*(?:请\s*)?(?:只|仅)?\s*(?:根据本页(?:可见文字|内容)\s*)?`+String.raw`(?:${B0}\s*${z0}|(?:把|将)?\s*${z0}\s*(?:请\s*)?(?:${B0}|改成|改为))`);function YD(e){let t=e.revision?.content;return typeof t=="string"?t:JSON.stringify(t||{},null,2)}function KD({before:e,after:t}){let a=(0,pt.useMemo)(()=>vh(e,t,{timeout:500}),[e,t]);return(0,B.jsx)("div",{className:"diff-view",children:a?a.map((n,l)=>(0,B.jsxs)("pre",{className:n.added?"diff-added":n.removed?"diff-removed":"diff-same",children:[(0,B.jsx)("span",{"aria-hidden":"true",children:n.added?"+":n.removed?"\u2212":" "}),(0,B.jsx)("code",{children:n.value})]},l)):(0,B.jsxs)("div",{className:"diff-large",children:[(0,B.jsx)("p",{children:"\u6587\u4EF6\u8F83\u5927\uFF0C\u8BF7\u5BF9\u7167\u4E24\u7248\u5B8C\u6574\u6E90\u7801\u3002"}),(0,B.jsx)("pre",{children:e}),(0,B.jsx)("pre",{children:t})]})})}function ZD({artifact:e}){let{state:t,controller:a}=ce(),[n,l]=(0,pt.useState)("preview"),[r,o]=(0,pt.useState)(""),[i,u]=(0,pt.useState)(""),[c,s]=(0,pt.useState)(null),[f,d]=(0,pt.useState)(null),[p,g]=(0,pt.useState)(null),[y,w]=(0,pt.useState)(!1),[x,m]=(0,pt.useState)(!1),h=YD(e),L=Rc(e),I=e.type==="slide-deck"&&e.status==="PUBLISHED"&&QD.test(r),C=JSON.stringify([e.id,e.currentRevision,r]),T=I&&!c&&i===C,N=c&&e.type==="slide-deck"&&(I||/^(?:请\s*)?(?:(?:只|仅)\s*)?(?:调整|修改|更改|优化|统一|重新设计)[^：:\n]*(?:版式|布局|排版)\s*[:：]/.test(r.trim())||/^(?:请\s*)?(?:只|仅)\s*(?:修改|调整|润色)[^：:\n]*页\s*(?:的\s*)?(?:文字|文案|措辞)\s*[:：]/.test(r.trim())),P=(0,pt.useRef)(null),k=t.previews[e.id],oe=async()=>{w(!0),m(!1);try{await a.launchPreview(e)}catch(z){a.error(z),m(!0)}finally{w(!1)}};(0,pt.useEffect)(()=>{s(null),d(null),u("")},[e.id,e.currentRevision]),(0,pt.useEffect)(()=>{let z=P.current;if(!z||n!=="source")return;let E=()=>{let O=z.selectionStart,$=z.selectionEnd;$>O&&(u(""),s({start:h.slice(0,O).split(`
`).length,end:h.slice(0,$).split(`
`).length,text:h.slice(O,$)}))};return z.addEventListener("select",E),z.addEventListener("pointerup",E),z.addEventListener("keyup",E),()=>{z.removeEventListener("select",E),z.removeEventListener("pointerup",E),z.removeEventListener("keyup",E)}},[n,h]);let ne=e.status==="GENERATING"||t.jobs.some(z=>z.result?.artifactId===e.id&&["QUEUED","RUNNING"].includes(z.status));return(0,B.jsxs)("div",{className:"artifact-workspace",children:[(0,B.jsxs)("div",{className:"artifact-title",children:[(0,B.jsx)(Ge,{size:17}),(0,B.jsxs)("div",{children:[(0,B.jsx)("strong",{children:e.title}),(0,B.jsxs)("small",{children:[_i[e.type]||e.type," \xB7 V",e.currentRevision]})]}),(0,B.jsx)(Zt,{status:e.status}),(0,B.jsx)("a",{className:"button icon-button",href:`/teacher/artifacts/${me(e.id)}`,target:"_blank",rel:"noopener noreferrer","aria-label":"\u5728\u5B8C\u6574\u6210\u54C1\u9875\u6253\u5F00",title:"\u5728\u5B8C\u6574\u6210\u54C1\u9875\u6253\u5F00",children:(0,B.jsx)(Nl,{size:15})})]}),(0,B.jsxs)("div",{className:"artifact-subtabs",role:"tablist","aria-label":"\u6210\u54C1\u5DE5\u4F5C\u533A",children:[[{key:"preview",label:"\u9884\u89C8",icon:to},{key:"source",label:e.type==="learning-flow"?"\u5B66\u4E60\u89C4\u683C":"\u6E90\u7801",icon:Wn},{key:"history",label:"\u7248\u672C",icon:Bi}].map(z=>(0,B.jsxs)("button",{role:"tab","aria-selected":n===z.key,onClick:()=>l(z.key),children:[(0,B.jsx)(z.icon,{size:14}),z.label]},z.key)),n==="preview"&&(0,B.jsx)(K,{label:"\u91CD\u65B0\u52A0\u8F7D\u9884\u89C8",disabled:y||ne,onClick:()=>void oe(),children:(0,B.jsx)(qi,{size:13})})]}),(0,B.jsxs)("div",{className:"artifact-content",children:[(0,B.jsx)("div",{className:"preview-area",hidden:n!=="preview",children:k&&!x?(0,B.jsx)("iframe",{title:`\u4EA4\u4E92\u9884\u89C8\uFF1A${e.title}`,src:k,allow:"fullscreen; clipboard-write",referrerPolicy:"same-origin"}):(0,B.jsxs)(qa,{icon:(0,B.jsx)(to,{size:28}),title:ne?"\u6210\u54C1\u6B63\u5728\u751F\u6210":x?"\u9884\u89C8\u672A\u80FD\u52A0\u8F7D":"\u5728\u8FD9\u91CC\u76F4\u63A5\u4F53\u9A8C\u6210\u54C1",children:[(0,B.jsx)("p",{children:ne?"\u539F\u7248\u672C\u4F1A\u4FDD\u7559\uFF0C\u5B8C\u6210\u540E\u53EF\u4EE5\u7EE7\u7EED\u5BA1\u9605\u3002":L?"\u6253\u5F00\u8BFE\u4EF6\u5DE5\u4F5C\u5BA4\u8FDB\u884C\u7F16\u8F91\u6216\u5206\u6B65\u6F14\u793A\u3002":"\u8BFE\u4EF6\u3001\u4EA4\u4E92\u6F14\u793A\u4E0E\u4E09\u7EF4\u573A\u666F\u4F1A\u5728\u5DE5\u4F5C\u533A\u4E2D\u6253\u5F00\u3002"}),(0,B.jsxs)(_,{className:"primary",disabled:y||ne,onClick:()=>void oe(),children:[y?(0,B.jsx)(St,{className:"spin",size:15}):(0,B.jsx)(hn,{size:15}),y?"\u6B63\u5728\u8FDE\u63A5\u9884\u89C8":"\u6253\u5F00\u4EA4\u4E92\u9884\u89C8"]})]})}),n==="source"&&(0,B.jsxs)("div",{className:"source-area",children:[(0,B.jsxs)("div",{className:"source-hint",children:[(0,B.jsx)(Ni,{size:14}),"\u9009\u4E2D\u9700\u8981\u4FEE\u6539\u7684\u6E90\u7801\uFF0C\u6DFB\u52A0\u5230\u4E0B\u65B9\u4FEE\u6539\u8981\u6C42"]}),(0,B.jsx)("textarea",{ref:P,className:"source-editor",readOnly:!0,"aria-label":"\u6210\u54C1\u5B8C\u6574\u6E90\u7801",spellCheck:!1,value:h,onSelect:z=>{let{selectionStart:E,selectionEnd:O}=z.currentTarget;O>E&&s({start:h.slice(0,E).split(`
`).length,end:h.slice(0,O).split(`
`).length,text:h.slice(E,O)})}})]}),n==="history"&&(0,B.jsxs)("div",{className:"history-area",children:[(e.history||[]).map(z=>(0,B.jsxs)("div",{className:"revision-row",children:[(0,B.jsxs)("span",{className:"revision-badge",children:["V",z.revision]}),(0,B.jsxs)("div",{children:[(0,B.jsx)("strong",{children:z.revision===e.currentRevision?"\u5F53\u524D\u7248\u672C":z.instruction||"\u5386\u53F2\u7248\u672C"}),(0,B.jsxs)("small",{children:[Na(z.created)," ",z.author]})]}),(0,B.jsx)(_,{onClick:()=>void Oe(`/artifacts/${me(e.id)}/revisions/${z.revision}`).then(E=>d(E.revision)).catch(a.error),children:"\u6BD4\u8F83"}),z.revision!==e.currentRevision&&e.capabilities?.edit&&(0,B.jsx)(K,{label:`\u6062\u590D\u7248\u672C ${z.revision}`,onClick:()=>g(z.revision),children:(0,B.jsx)(gn,{size:14})})]},z.revision)),f&&(0,B.jsxs)("section",{className:"revision-compare",children:[(0,B.jsxs)("header",{children:[(0,B.jsxs)("strong",{children:["V",f.revision," \u2192 V",e.currentRevision]}),(0,B.jsx)(K,{label:"\u5173\u95ED\u5DEE\u5F02",onClick:()=>d(null),children:(0,B.jsx)(Re,{size:14})})]}),(0,B.jsx)(KD,{before:typeof f.content=="string"?f.content:JSON.stringify(f.content,null,2),after:h})]})]})]}),e.type==="learning-flow"&&(0,B.jsx)("div",{className:"source-hint",children:"\u6559\u5B66\u8BF4\u660E\u3001\u5BA1\u6838\u53D1\u5E03\u548C\u5B66\u751F\u8BC1\u636E\u53EF\u5728\u9884\u89C8\u5185\u7684\u201C\u5185\u5BB9\u4E0E\u5BA1\u6838\u201D\u4E2D\u5904\u7406\u3002"}),e.capabilities?.edit&&!L&&e.type!=="learning-flow"&&(0,B.jsxs)("form",{className:"revision-composer",onSubmit:z=>{if(z.preventDefault(),N)return;let E=c?`${r}

\u4EC5\u4FEE\u6539\u5F53\u524D\u7248\u672C V${e.currentRevision} \u4E2D\u6240\u9009\u8303\u56F4\uFF08\u6E90\u7801\u7B2C ${c.start}\u2013${c.end} \u884C\uFF09\uFF0C\u4FDD\u7559\u5176\u4F59\u5185\u5BB9\u4E0E\u4EA4\u4E92\uFF1A
${c.text}`:r;u(""),a.run(async()=>{await a.revise(e,E,T),o(""),s(null)})},children:[(0,B.jsxs)("div",{className:"revision-context",children:[(0,B.jsx)("strong",{children:"\u5C40\u90E8\u4FEE\u6539"}),(0,B.jsxs)("span",{children:["\u57FA\u4E8E V",e.currentRevision]}),c&&(0,B.jsxs)("span",{className:"chip",children:["\u7B2C ",c.start,"\u2013",c.end," \u884C",(0,B.jsx)(K,{label:"\u53D6\u6D88\u6E90\u7801\u9009\u533A",onClick:()=>s(null),children:(0,B.jsx)(Re,{size:12})})]})]}),(0,B.jsxs)("div",{className:"revision-input",children:[(0,B.jsx)("textarea",{"aria-label":"\u6210\u54C1\u5C40\u90E8\u4FEE\u6539\u8981\u6C42",placeholder:e.type==="slide-deck"?"\u4F8B\u5982\uFF1A\u8BF7\u8C03\u6574\u7B2C2\u9875\u7684\u7248\u5F0F\uFF1A\u628A\u6807\u9898\u79FB\u5230\u53F3\u4E0A\u65B9":"\u4F8B\u5982\uFF1A\u4E3A\u8FD9\u4E2A\u573A\u666F\u589E\u52A0\u4E00\u4E2A\u51B3\u7B56\u5206\u652F\uFF0C\u4FDD\u7559\u5176\u4ED6\u4EA4\u4E92\u2026",rows:2,value:r,onChange:z=>{u(""),o(z.target.value)}}),(0,B.jsx)("button",{className:"button send-button","aria-label":"\u63D0\u4EA4\u5C40\u90E8\u4FEE\u6539",disabled:!r.trim()||t.busy||ne||!!N,children:(0,B.jsx)(Bl,{size:17})})]}),I&&!c&&(0,B.jsxs)("label",{className:"source-hint",children:[(0,B.jsx)("input",{type:"checkbox",checked:T,onChange:z=>u(z.target.checked?C:"")}),"\u5C06\u6307\u5B9A\u9875\u7684\u539F\u8BB2\u7A3F\u7528\u4E8E\u672C\u6B21\u6DA6\u8272\u3002\u52FE\u9009\u540E\uFF0C\u8BE5\u9875\u539F\u7A3F\u4F1A\u53D1\u7ED9\u672C\u8BFE\u7A0B\u914D\u7F6E\u7684\u5916\u90E8\u6A21\u578B\uFF0C\u8BF7\u786E\u8BA4\u53EA\u542B\u53EF\u5206\u4EAB\u7684\u6559\u5B66\u6587\u5B57\u3002 \u672A\u52FE\u9009\u65F6\u53EF\u6839\u636E\u672C\u9875\u53EF\u89C1\u6587\u5B57\u91CD\u5199\u8BB2\u7A3F\u3002"]}),N?(0,B.jsx)("small",{role:"status",children:"\u8BF7\u5148\u53D6\u6D88\u6E90\u7801\u9009\u533A\uFF0C\u518D\u63D0\u4EA4\u6309\u9875\u4FEE\u6539\u3002"}):(0,B.jsx)("small",{children:"\u4FEE\u6539\u4F1A\u4FDD\u5B58\u4E3A\u65B0\u7248\u672C\uFF0C\u53EF\u4EE5\u6BD4\u8F83\u6216\u6062\u590D\u3002"})]}),p!==null&&(0,B.jsxs)(ma,{title:`\u6062\u590D\u7248\u672C V${p}`,onClose:()=>g(null),children:[(0,B.jsx)("div",{className:"dialog-body",children:(0,B.jsx)("p",{children:"\u4ECE\u6240\u9009\u7248\u672C\u521B\u5EFA\u65B0\u8349\u7A3F\u3002\u5F53\u524D\u7248\u672C\u548C\u5386\u53F2\u8BB0\u5F55\u90FD\u4F1A\u4FDD\u7559\u3002"})}),(0,B.jsxs)("div",{className:"dialog-actions",children:[(0,B.jsx)(_,{onClick:()=>g(null),children:"\u53D6\u6D88"}),(0,B.jsx)(_,{className:"primary",disabled:t.busy,onClick:()=>void a.run(async()=>{await a.restore(e,p),g(null)}),children:"\u521B\u5EFA\u65B0\u8349\u7A3F"})]})]})]})}function R0(){let{state:e,controller:t}=ce(),[a,n]=(0,pt.useState)(""),l=e.selectedArtifact?e.artifactDetails[e.selectedArtifact]:null;return(0,B.jsxs)("div",{className:"artifact-panel",children:[(0,B.jsxs)("div",{className:"artifact-tabs",role:"tablist","aria-label":"\u6253\u5F00\u7684\u6210\u54C1",children:[(0,B.jsxs)("button",{role:"tab","aria-selected":!e.selectedArtifact,onClick:()=>t.patch({selectedArtifact:null}),children:[(0,B.jsx)(Ge,{size:14}),"\u6210\u54C1\u5E93"]}),e.openArtifacts.map(r=>(0,B.jsxs)("div",{className:e.selectedArtifact===r?"active":"",children:[(0,B.jsx)("button",{role:"tab","aria-selected":e.selectedArtifact===r,onClick:()=>t.patch({selectedArtifact:r}),children:e.artifactDetails[r]?.title||"\u8BFB\u53D6\u4E2D\u2026"}),(0,B.jsx)(K,{label:`\u5173\u95ED\u6210\u54C1 ${e.artifactDetails[r]?.title||""}`,onClick:()=>t.closeArtifact(r),children:(0,B.jsx)(Re,{size:12})})]},r))]}),e.selectedArtifact?l?(0,B.jsx)(ZD,{artifact:l},l.id):(0,B.jsx)(qa,{title:"\u6B63\u5728\u8BFB\u53D6\u6210\u54C1\u2026"}):(0,B.jsxs)("div",{className:"artifact-library",children:[(0,B.jsxs)("label",{className:"search-field",children:[(0,B.jsx)(da,{size:15}),(0,B.jsx)("input",{"aria-label":"\u641C\u7D22\u6210\u54C1",placeholder:"\u641C\u7D22\u6210\u54C1\u2026",value:a,onChange:r=>n(r.target.value)})]}),(0,B.jsxs)("div",{className:"panel-scroll",children:[e.artifacts.filter(r=>!a||r.title.toLowerCase().includes(a.toLowerCase())).map(r=>(0,B.jsxs)("button",{className:"artifact-list-row",onClick:()=>void t.openArtifact(r.id).catch(t.error),children:[(0,B.jsx)("span",{className:"file-icon",children:(0,B.jsx)(Ge,{size:20})}),(0,B.jsxs)("span",{children:[(0,B.jsx)("strong",{children:r.title}),(0,B.jsxs)("small",{children:[_i[r.type]||r.type," \xB7 V",r.currentRevision]})]}),(0,B.jsx)(Zt,{status:r.status})]},r.id)),!e.artifacts.length&&(0,B.jsx)(qa,{icon:(0,B.jsx)(Ge,{size:28}),title:"\u4F60\u7684\u6559\u5B66\u6210\u54C1\u5DE5\u4F5C\u533A",children:(0,B.jsx)("p",{children:"\u751F\u6210\u5B8C\u6210\u540E\uFF0C\u5728\u8FD9\u91CC\u9884\u89C8\u3001\u6BD4\u8F83\u7248\u672C\u548C\u7EE7\u7EED\u4FEE\u6539\u3002"})})]})]})]})}var fu=J(je(),1);var j=J(ye(),1);function JD({item:e}){let{controller:t}=ce(),a={command:Vl,tool:Hi,workflow:ll,reasoning:wi,artifact:Ba}[e.kind]||sa,n=e.content;return(0,j.jsxs)("details",{className:`activity-row ${e.status}`,children:[(0,j.jsxs)("summary",{children:[(0,j.jsx)(a,{size:15}),(0,j.jsxs)("span",{children:[(0,j.jsx)("strong",{children:e.title||e.kind}),e.command&&(0,j.jsx)("code",{children:e.command})]}),(0,j.jsx)(Zt,{status:e.status})]}),(0,j.jsxs)("div",{className:"activity-detail",children:[e.cwd&&(0,j.jsxs)("div",{className:"quiet",children:["\u76EE\u5F55 ",(0,j.jsx)("code",{children:e.cwd})]}),e.command&&(0,j.jsxs)("div",{className:"command-line",children:[(0,j.jsxs)("code",{children:["$ ",e.command]}),(0,j.jsx)(K,{label:"\u590D\u5236\u547D\u4EE4",onClick:()=>void navigator.clipboard.writeText(e.command).catch(t.error),children:(0,j.jsx)(Ol,{size:13})})]}),e.input!==void 0&&(0,j.jsxs)("section",{children:[(0,j.jsx)("h4",{children:"\u5DE5\u5177\u8F93\u5165"}),(0,j.jsx)(va,{value:e.input})]}),n&&(0,j.jsxs)("section",{children:[(0,j.jsx)("h4",{children:e.kind==="reasoning"?"\u6A21\u578B\u8FD4\u56DE\u7684\u63A8\u7406\u6458\u8981":"\u8FC7\u7A0B\u8BB0\u5F55"}),(0,j.jsx)(va,{value:n})]}),e.output&&(0,j.jsxs)("section",{children:[(0,j.jsx)("h4",{children:"\u8F93\u51FA"}),(0,j.jsx)(va,{value:e.output})]}),e.exitCode!==void 0&&(0,j.jsxs)("div",{className:"exit-code",children:["\u9000\u51FA\u7801 ",(0,j.jsx)("strong",{children:e.exitCode})]}),e.usage&&(0,j.jsx)(va,{value:e.usage}),e.startedAt&&e.completedAt&&(0,j.jsxs)("small",{className:"quiet",children:["\u8017\u65F6 ",Math.max(0,(e.completedAt-e.startedAt)/1e3).toFixed(1)," \u79D2"]})]})]})}function O0(){let{state:e,controller:t}=ce(),[a,n]=(0,fu.useState)("all"),[l,r]=(0,fu.useState)(""),o=e.jobs.filter(s=>s.threadId===e.thread?.id||s.id===e.selectedJob),i=e.jobs.find(s=>s.id===e.selectedJob)||o[0],c=(0,fu.useMemo)(()=>i?Ec(i.id,e.events[i.id]||[],nt(i)):[],[i,e.events]).filter(s=>s.kind!=="message"&&(a==="all"||a===s.kind)&&(!l||`${s.title} ${s.command||""} ${s.output||""} ${s.content||""}`.toLowerCase().includes(l.toLowerCase())));return(0,j.jsxs)("div",{className:"activity-panel",children:[(0,j.jsxs)("div",{className:"panel-toolbar",children:[(0,j.jsxs)("select",{"aria-label":"\u9009\u62E9\u4EFB\u52A1\u6267\u884C\u8BB0\u5F55",value:i?.id||"",onChange:s=>t.selectJob(s.target.value),children:[(0,j.jsx)("option",{value:"",disabled:!0,children:"\u9009\u62E9\u4EFB\u52A1"}),o.map(s=>(0,j.jsxs)("option",{value:s.id,children:[s.title||s.kind," \xB7 ",s.id.slice(0,8)]},s.id))]}),(0,j.jsx)(K,{label:"\u6253\u5F00\u4EFB\u52A1\u4E2D\u5FC3",onClick:()=>t.patch({taskCenter:!0}),children:(0,j.jsx)(ca,{size:16})})]}),i&&(0,j.jsxs)("div",{className:"activity-job",children:[(0,j.jsx)(Zt,{status:i.status}),(0,j.jsx)("span",{children:i.stage||"\u4EFB\u52A1\u6267\u884C"}),Number.isFinite(i.progress)&&(0,j.jsx)("progress",{"aria-label":"\u4EFB\u52A1\u8FDB\u5EA6",max:100,value:i.progress}),["FAILED","CANCELED"].includes(i.status)&&(0,j.jsx)(_,{onClick:()=>void t.run(()=>t.retry(i.id)),children:"\u4ECE\u4FDD\u7559\u7ED3\u679C\u7EE7\u7EED"})]}),(0,j.jsxs)("div",{className:"activity-filters",children:[(0,j.jsx)(tl,{size:14}),(0,j.jsxs)("select",{"aria-label":"\u6267\u884C\u8BB0\u5F55\u7C7B\u578B",value:a,onChange:s=>n(s.target.value),children:[(0,j.jsx)("option",{value:"all",children:"\u5168\u90E8\u8BB0\u5F55"}),(0,j.jsx)("option",{value:"workflow",children:"\u8BA1\u5212\u4E0E\u6D41\u7A0B"}),(0,j.jsx)("option",{value:"tool",children:"\u5DE5\u5177\u8C03\u7528"}),(0,j.jsx)("option",{value:"command",children:"\u8FD0\u884C\u547D\u4EE4"}),(0,j.jsx)("option",{value:"reasoning",children:"\u63A8\u7406\u6458\u8981"}),(0,j.jsx)("option",{value:"artifact",children:"\u6210\u54C1"})]}),(0,j.jsx)("input",{"aria-label":"\u641C\u7D22\u6267\u884C\u8BB0\u5F55",placeholder:"\u641C\u7D22\u8F93\u51FA\u2026",value:l,onChange:s=>r(s.target.value)})]}),(0,j.jsxs)("div",{className:"panel-scroll",children:[i?.modelRoute?.invocationStatus&&(0,j.jsxs)("details",{className:"usage-summary",children:[(0,j.jsx)("summary",{children:"\u6A21\u578B\u4E0E\u7528\u91CF \xB7 \u6700\u8FD1\u4E00\u6B21\u8C03\u7528"}),(0,j.jsx)("p",{children:i.modelRoute.actualModel}),i.modelRoute.usage&&(0,j.jsx)(va,{value:i.modelRoute.usage}),Number.isFinite(i.modelRoute.latencyMs)&&(0,j.jsxs)("small",{children:["\u8017\u65F6 ",(i.modelRoute.latencyMs/1e3).toFixed(1)," \u79D2"]})]}),c.map(s=>(0,j.jsx)(JD,{item:s},s.id)),!c.length&&(0,j.jsx)(qa,{icon:(0,j.jsx)(sa,{size:26}),title:i?"\u7B49\u5F85\u6267\u884C\u8BB0\u5F55":"\u6267\u884C\u8FC7\u7A0B\u4F1A\u663E\u793A\u5728\u8FD9\u91CC",children:(0,j.jsx)("p",{children:i?"\u8BB0\u5F55\u6765\u81EA\u540E\u53F0\u4EFB\u52A1\u3002\u6B63\u5728\u7B49\u5F85\u65B0\u7684\u4E8B\u4EF6\u3002":"\u8BA1\u5212\u3001\u5DE5\u5177\u8C03\u7528\u3001\u547D\u4EE4\u8F93\u51FA\u4E0E\u7ED3\u679C\u4F1A\u968F\u4EFB\u52A1\u66F4\u65B0\u3002"})})]}),(0,j.jsx)("footer",{className:"panel-note",children:"\u4EC5\u663E\u793A\u540E\u53F0\u5B9E\u9645\u8FD4\u56DE\u7684\u6267\u884C\u4E8B\u4EF6"})]})}var Y=J(ye(),1);function N0(){let{state:e,controller:t}=ce(),a=e.context.teacherDojos||[],n=a.find(l=>l.id===e.thread?.dojoId);return(0,Y.jsxs)("div",{className:"panel-scroll context-panel",children:[(0,Y.jsxs)("header",{className:"section-heading",children:[(0,Y.jsx)(ql,{size:18}),(0,Y.jsx)("h2",{children:"\u672C\u6B21\u521B\u4F5C\u7684\u4E0A\u4E0B\u6587"})]}),(0,Y.jsx)("p",{className:"quiet",children:"\u9009\u62E9\u8BFE\u7A0B\u3001\u8D44\u6599\u548C\u6280\u80FD\uFF0C\u4E3A\u8FD9\u6B21\u6559\u5B66\u4EFB\u52A1\u63D0\u4F9B\u4F9D\u636E\u3002"}),(0,Y.jsxs)("section",{children:[(0,Y.jsx)("h3",{children:"\u8BFE\u7A0B\u4E0E\u7AE0\u8282"}),(0,Y.jsxs)("label",{className:"field",children:["\u5F52\u5C5E\u8BFE\u7A0B",(0,Y.jsxs)("select",{"aria-label":"\u5F52\u5C5E\u8BFE\u7A0B",disabled:e.busy,value:e.thread?.dojoId??"",onChange:l=>void t.run(()=>t.setScope(l.target.value)),children:[(0,Y.jsx)("option",{value:"",children:"\u72EC\u7ACB\u521B\u4F5C\uFF0C\u6682\u4E0D\u5173\u8054\u8BFE\u7A0B"}),a.map(l=>(0,Y.jsx)("option",{value:l.id,children:l.name},l.id))]})]}),n&&(0,Y.jsxs)("label",{className:"field",children:["\u7AE0\u8282",(0,Y.jsxs)("select",{"aria-label":"\u5F52\u5C5E\u7AE0\u8282",disabled:e.busy,value:e.thread?.moduleIndex??"",onChange:l=>void t.run(()=>t.setScope(String(n.id),l.target.value)),children:[(0,Y.jsx)("option",{value:"",children:"\u6574\u95E8\u8BFE\u7A0B"}),(n.modules||[]).map(l=>(0,Y.jsx)("option",{value:l.index??l.moduleIndex,children:l.name||l.title},l.index??l.moduleIndex))]})]})]}),(0,Y.jsxs)("section",{children:[(0,Y.jsxs)("header",{children:[(0,Y.jsxs)("h3",{children:[(0,Y.jsx)(za,{size:15}),"\u672C\u8F6E\u5F15\u7528\u8D44\u6599"]}),(0,Y.jsx)(K,{label:"\u6DFB\u52A0\u5F15\u7528\u8D44\u6599",onClick:()=>t.openCatalog("sources"),children:(0,Y.jsx)(Oa,{size:15})})]}),!e.draft.sources.length&&(0,Y.jsx)("p",{className:"quiet",children:"\u5F15\u7528\u8D44\u6599\u540E\uFF0C\u667A\u80FD\u4F53\u4F1A\u4F18\u5148\u4F9D\u636E\u539F\u6587\u5904\u7406\u3002"}),e.draft.sources.map(l=>(0,Y.jsxs)("div",{className:"context-item",children:[(0,Y.jsx)(nl,{size:15}),(0,Y.jsx)("span",{children:l.name}),(0,Y.jsx)(K,{label:`\u79FB\u9664 ${l.name}`,onClick:()=>t.setDraft({sources:e.draft.sources.filter(r=>r.id!==l.id)}),children:(0,Y.jsx)(Re,{size:14})})]},l.id)),(0,Y.jsxs)(_,{onClick:()=>t.openCatalog("sources"),children:[(0,Y.jsx)(Oa,{size:14}),"\u5F15\u7528\u8D44\u6599\u5E93"]})]}),(0,Y.jsxs)("section",{children:[(0,Y.jsxs)("header",{children:[(0,Y.jsxs)("h3",{children:[(0,Y.jsx)(Rt,{size:15}),"\u672C\u8F6E\u6307\u5B9A\u6280\u80FD"]}),(0,Y.jsx)(K,{label:"\u6DFB\u52A0\u6280\u80FD",onClick:()=>t.openCatalog("skills"),children:(0,Y.jsx)(Oa,{size:15})})]}),!e.draft.skills.length&&(0,Y.jsx)("p",{className:"quiet",children:"\u667A\u80FD\u4F53\u4F1A\u6309\u4EFB\u52A1\u9009\u62E9\u6280\u80FD\uFF0C\u4E5F\u53EF\u4EE5\u624B\u52A8\u6307\u5B9A\u3002"}),e.draft.skills.map(l=>(0,Y.jsxs)("div",{className:"context-item",children:[(0,Y.jsx)(Rt,{size:15}),(0,Y.jsxs)("span",{children:["/",l]}),(0,Y.jsx)(K,{label:`\u79FB\u9664 ${l}`,onClick:()=>t.setDraft({skills:e.draft.skills.filter(r=>r!==l)}),children:(0,Y.jsx)(Re,{size:14})})]},l)),(0,Y.jsxs)(_,{onClick:()=>t.openCatalog("skills"),children:[(0,Y.jsx)(Oa,{size:14}),"\u9009\u62E9\u6280\u80FD"]})]}),(0,Y.jsxs)("section",{children:[(0,Y.jsx)("h3",{children:"\u5F53\u524D\u6A21\u578B"}),(0,Y.jsx)("strong",{children:"DeepSeek v4.1 Flash"}),(0,Y.jsx)("p",{className:"quiet",children:"\u5168\u5C40\u667A\u80FD\u4F53\u4E0E\u5185\u5BB9\u751F\u6210"})]}),(0,Y.jsxs)("a",{className:"button",href:"/teacher/library",target:"_blank",rel:"noopener noreferrer",children:[(0,Y.jsx)(za,{size:15}),"\u7BA1\u7406\u5B8C\u6574\u8D44\u6599\u5E93",(0,Y.jsx)(Nl,{size:13})]})]})}var G=J(ye(),1);function q0(){let{state:e,controller:t}=ce(),[a,n]=(0,ka.useState)(t.storage.value("panelWidth",520)),[l,r]=(0,ka.useState)(t.storage.value("filePreviewWidth",Math.round(window.innerWidth*.44))),[o,i]=(0,ka.useState)(!1),[u,c]=(0,ka.useState)(t.storage.value("sidebarCollapsed",!1)),s=(0,ka.useRef)(null);(0,ka.useEffect)(()=>{t.boot();let m=C=>{if(!C.isComposing){if(document.querySelector('#searchModal:not([hidden])[aria-hidden="false"]')){(C.metaKey||C.ctrlKey)&&C.key.toLowerCase()==="k"&&(C.preventDefault(),C.stopPropagation(),document.getElementById("searchInput")?.focus());return}C.target instanceof Element&&C.target.closest(".product-navbar")||((C.metaKey||C.ctrlKey)&&C.key.toLowerCase()==="k"&&(C.preventDefault(),C.stopPropagation(),t.patch({modal:t.snapshot().modal==="search"?null:"search"})),C.altKey&&C.key.toLowerCase()==="n"&&(C.preventDefault(),t.newThread()),(C.metaKey||C.ctrlKey)&&C.shiftKey&&C.code==="Backslash"&&(C.preventDefault(),t.togglePanel()))}},h=()=>{let C=new URLSearchParams(location.search).get("thread");C?t.activate(C,!1).catch(t.error):t.newThread()},L=document.getElementById("global-teaching-tasks"),I=C=>{if(C.button||C.metaKey||C.ctrlKey||C.shiftKey||C.altKey)return;C.preventDefault(),t.patch({taskCenter:!0,sidebarOpen:!1});let T=document.getElementById("product-nav-toggle");T?.getAttribute("aria-expanded")==="true"&&T.click()};return L?.addEventListener("click",I),window.addEventListener("keydown",m,!0),window.addEventListener("popstate",h),()=>{t.dispose(),window.removeEventListener("keydown",m,!0),L?.removeEventListener("click",I),window.removeEventListener("popstate",h)}},[t]);let f=e.panel==="files"?e.selectedFile:null,d=f?l:a,p=f?"filePreviewWidth":"panelWidth",g=f?r:n,y=()=>{let m=window.innerWidth,h=m-(u?360:610),L=f?m*(m<=820?.52:.53):h;return Math.max(340,Math.min(h,Math.floor(L)))},w=()=>{t.togglePanel(),i(!1)};(0,ka.useEffect)(()=>{e.panelOpen||i(!1)},[e.panelOpen]),(0,ka.useEffect)(()=>{if(!e.panelOpen||!f||e.modal||e.sidebarOpen)return;let m=h=>{h.key!=="Escape"||h.defaultPrevented||h.isComposing||(o?i(!1):t.togglePanel())};return window.addEventListener("keydown",m),()=>window.removeEventListener("keydown",m)},[t,o,f,e.modal,e.panelOpen,e.sidebarOpen]);let x=e.context.teacherDojos?.find(m=>m.id===e.thread?.dojoId);return(0,G.jsxs)("div",{className:`workbench ${e.panelOpen?"has-panel":""} ${o&&e.panelOpen?"expanded-panel":""} ${f?"has-file-preview":""} ${u?"sidebar-collapsed":""}`,"data-ready":!e.booting,style:{"--panel-width":`${d}px`},children:[(0,G.jsx)(TL,{}),(0,G.jsxs)("main",{className:"main-pane",children:[(0,G.jsxs)("header",{className:"workspace-header",children:[(0,G.jsx)(K,{className:"desktop-sidebar-toggle",label:u?"\u5C55\u5F00\u4F1A\u8BDD\u5BFC\u822A":"\u6536\u8D77\u4F1A\u8BDD\u5BFC\u822A","aria-controls":"workbench-sidebar","aria-expanded":!u,onClick:()=>{c(!u),t.storage.set("sidebarCollapsed",!u)},children:(0,G.jsx)(mn,{size:18})}),(0,G.jsx)(K,{className:"mobile-only",label:"\u6253\u5F00\u4F1A\u8BDD\u5BFC\u822A","aria-controls":"workbench-sidebar","aria-expanded":e.sidebarOpen,onClick:()=>t.patch({sidebarOpen:!0}),children:(0,G.jsx)(mn,{size:18})}),(0,G.jsx)("span",{className:"agent-mark",children:(0,G.jsx)(pa,{size:16})}),(0,G.jsxs)("div",{className:"workspace-breadcrumb",children:[(0,G.jsx)("span",{children:x?.name||"\u72EC\u7ACB\u521B\u4F5C"}),(0,G.jsx)(Rl,{size:12}),(0,G.jsx)("strong",{children:e.taskCenter?"\u4EFB\u52A1\u4E2D\u5FC3":e.thread?.title||"\u65B0\u4F1A\u8BDD"})]}),(0,G.jsxs)("div",{className:"header-actions",children:[!e.online&&(0,G.jsxs)("span",{className:"offline",title:"\u6B63\u5728\u91CD\u65B0\u8FDE\u63A5\uFF0C\u8F93\u5165\u5185\u5BB9\u4F1A\u4FDD\u7559",children:[(0,G.jsx)(Fi,{size:15}),"\u91CD\u65B0\u8FDE\u63A5"]}),e.thread&&(0,G.jsx)(K,{label:"\u521B\u5EFA\u4F1A\u8BDD\u5206\u652F",disabled:e.busy,onClick:()=>void t.run(()=>t.fork(e.thread.id)),children:(0,G.jsx)(dn,{size:16})}),(0,G.jsx)(K,{label:e.panelOpen?"\u6536\u8D77\u5DE5\u4F5C\u533A":"\u6253\u5F00\u5DE5\u4F5C\u533A","aria-pressed":e.panelOpen,onClick:()=>t.togglePanel(),children:(0,G.jsx)(Fl,{size:18})})]})]}),e.error&&(0,G.jsxs)("div",{className:"notice error",role:"alert",children:[(0,G.jsx)("span",{children:e.error}),(0,G.jsx)(K,{label:"\u5173\u95ED\u9519\u8BEF\u63D0\u793A",onClick:()=>t.patch({error:null}),children:(0,G.jsx)(Re,{size:14})})]}),e.notice&&(0,G.jsxs)("div",{className:"notice",role:"status",children:[(0,G.jsx)("span",{children:e.notice}),(0,G.jsx)(K,{label:"\u5173\u95ED\u63D0\u793A",onClick:()=>t.patch({notice:null}),children:(0,G.jsx)(Re,{size:14})})]}),e.booting||e.loadingThread?(0,G.jsxs)("div",{className:"workspace-loading",children:[(0,G.jsx)(pa,{size:25}),(0,G.jsx)("p",{children:e.loadingThread?"\u6B63\u5728\u8BFB\u53D6\u4F1A\u8BDD\u2026":"\u6B63\u5728\u6253\u5F00\u5DE5\u4F5C\u53F0\u2026"})]}):e.taskCenter?(0,G.jsx)(D0,{}):(0,G.jsx)(T0,{}),(0,G.jsxs)("nav",{className:"mobile-panel-nav","aria-label":"\u79FB\u52A8\u5DE5\u4F5C\u533A",children:[(0,G.jsx)(_,{onClick:()=>{e.panelOpen&&w(),t.patch({taskCenter:!1})},children:"\u5BF9\u8BDD"}),(0,G.jsxs)(_,{onClick:()=>t.setPanel("artifacts"),children:[(0,G.jsx)(Ge,{size:15}),"\u6210\u54C1"]}),(0,G.jsxs)(_,{onClick:()=>t.setPanel("activity"),children:[(0,G.jsx)(sa,{size:15}),"\u6267\u884C"]}),(0,G.jsxs)(_,{onClick:()=>t.setPanel("context"),children:[(0,G.jsx)(fa,{size:15}),"\u4E0A\u4E0B\u6587"]})]})]}),e.panelOpen&&(0,G.jsxs)(G.Fragment,{children:[(0,G.jsx)("div",{className:"panel-resizer",role:"separator","aria-label":"\u8C03\u6574\u5DE5\u4F5C\u533A\u5BBD\u5EA6","aria-orientation":"vertical","aria-valuenow":Math.min(y(),Math.max(340,d)),"aria-valuemin":340,"aria-valuemax":y(),tabIndex:0,onKeyDown:m=>{if(["ArrowLeft","ArrowRight","Home"].includes(m.key)){m.preventDefault();let h=m.key==="Home"?Math.min(y(),f?Math.round(window.innerWidth*.44):520):Math.min(y(),Math.max(340,d+(m.key==="ArrowLeft"?32:-32)));g(h),t.storage.set(p,h)}},onPointerDown:m=>{s.current={x:m.clientX,width:m.currentTarget.nextElementSibling?.getBoundingClientRect().width||d},m.currentTarget.setPointerCapture(m.pointerId)},onPointerMove:m=>{s.current&&g(Math.min(y(),Math.max(340,s.current.width+s.current.x-m.clientX)))},onPointerUp:m=>{s.current=null,m.currentTarget.releasePointerCapture(m.pointerId);let h=m.currentTarget.nextElementSibling?.getBoundingClientRect().width||d;t.storage.set(p,Math.round(h))},onPointerCancel:()=>{s.current=null}}),(0,G.jsx)("aside",{className:"work-area",id:f?"workbench-file-preview":void 0,"aria-label":f?"\u5BF9\u8BDD\u6587\u4EF6\u9884\u89C8":"\u6210\u54C1\u4E0E\u6267\u884C\u5DE5\u4F5C\u533A",children:f?(0,G.jsx)(I0,{file:f,expanded:o,onExpand:()=>i(!o),onClose:w}):(0,G.jsxs)(G.Fragment,{children:[(0,G.jsxs)("header",{className:"panel-header",children:[(0,G.jsx)("div",{role:"tablist","aria-label":"\u5DE5\u4F5C\u533A\u9875\u9762",children:[{key:"artifacts",title:"\u6210\u54C1",Icon:Ge},{key:"activity",title:"\u6267\u884C",Icon:sa},{key:"context",title:"\u4E0A\u4E0B\u6587",Icon:fa}].map(m=>(0,G.jsxs)("button",{role:"tab","aria-selected":e.panel===m.key,onClick:()=>t.setPanel(m.key),children:[(0,G.jsx)(m.Icon,{size:15}),m.title]},m.key))}),(0,G.jsx)(K,{className:"desktop-only",label:o?"\u6062\u590D\u5206\u680F":"\u653E\u5927\u5DE5\u4F5C\u533A",onClick:()=>i(!o),children:o?(0,G.jsx)(Pl,{size:15}):(0,G.jsx)(Ul,{size:15})}),(0,G.jsx)(K,{label:"\u5173\u95ED\u5DE5\u4F5C\u533A",onClick:w,children:(0,G.jsx)(Re,{size:16})})]}),(0,G.jsx)("div",{className:"panel-content",hidden:e.panel!=="artifacts",children:(0,G.jsx)(R0,{})}),(0,G.jsx)("div",{className:"panel-content",hidden:e.panel!=="activity",children:(0,G.jsx)(O0,{})}),(0,G.jsx)("div",{className:"panel-content",hidden:e.panel!=="context",children:(0,G.jsx)(N0,{})})]})})]}),(0,G.jsx)(M0,{})]})}var jc=class{storage;listeners=new Set;state;epoch=0;watch;timer;cursor={};stop=!1;activeJobReads=new Set;pendingSubmit=null;creating;mutationKeys=new Map;catalogLoaded=new Set;classroomActions=new Set;constructor(t){this.storage=new Pc(t),this.state={booting:!0,loadingThread:!1,busy:!1,online:!0,threads:[],thread:null,context:{},jobs:[],events:{},selectedJob:null,artifacts:[],artifactDetails:{},previews:{},openArtifacts:[],selectedArtifact:null,materials:[],skills:[],draft:this.storage.draft(null),uploads:[],panel:"artifacts",selectedFile:null,panelOpen:window.innerWidth>720&&this.storage.value("panelOpen",!1),sidebarOpen:!1,taskCenter:!1,modal:null,error:null,notice:null,threadFilter:"",archived:!1}}subscribe=t=>(this.listeners.add(t),()=>{this.listeners.delete(t)});snapshot=()=>this.state;patch=t=>{this.state={...this.state,...t},this.listeners.forEach(a=>a())};error=t=>{this.stop||this.patch({error:t instanceof Error?t.message:String(t)})};notify=t=>this.patch({notice:t,error:null});async run(t){if(!this.state.busy){this.patch({busy:!0,error:null});try{await t()}catch(a){this.error(a)}finally{this.patch({busy:!1})}}}async mutate(t,a={},n="POST"){let l=JSON.stringify([t,n,a]),r=this.mutationKeys.get(l)||rr();this.mutationKeys.set(l,r);let o=await Oe(t,{method:n,body:a,key:r});return this.mutationKeys.delete(l),o}async boot(){try{let t=await Promise.allSettled([Oe("/context?view=teacher-shell"),this.loadThreads(),this.loadArtifacts()]);if(t[0].status==="rejected")throw t[0].reason;this.patch({context:t[0].value});for(let r of t.slice(1))r.status==="rejected"&&this.error(r.reason);let a=new URLSearchParams(location.search).get("thread");a&&await this.activate(a,!1);let n=new URLSearchParams(location.search);if(!a&&n.get("inquiry")==="1"){this.setDraft({learningPattern:"process-inquiry",text:n.get("prompt")||"\u521B\u5EFA AES-128 \u6D41\u7A0B\u63A2\u7A76\u5F0F\u5B66\u4E60\u9879\u76EE\uFF0C\u5148\u4FDD\u5B58\u8349\u7A3F\u3002"});let r=(this.state.context.teacherDojos||[]).find(i=>i.referenceId===n.get("dojo"));if(n.has("dojo")&&!r)throw new Error("\u76EE\u6807\u8BFE\u7A0B\u4E0D\u5B58\u5728\u6216\u65E0\u6743\u8BBF\u95EE\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u8BFE\u7A0B\u3002");r&&await this.setScope(String(r.id),n.get("module")??"");let o=new URL(location.href);for(let i of["inquiry","prompt","dojo","module"])o.searchParams.delete(i);history.replaceState({},"",o)}let l=new URLSearchParams(location.search).get("artifact");l&&!this.state.selectedFile&&await this.openArtifact(l),await this.loadJobs(),new URLSearchParams(location.search).get("tasks")==="1"&&this.patch({taskCenter:!0})}catch(t){this.error(t)}finally{this.patch({booting:!1}),this.schedule()}}dispose(){this.stop=!0,this.epoch++,this.watch?.abort(),clearTimeout(this.timer)}setDraft(t){let a={...this.state.draft,...t};this.storage.save(this.state.thread?.id||null,a),this.patch({draft:a})}setPanel(t){this.state.selectedFile&&this.updateFileUrl(null),this.patch({panel:t,panelOpen:!0,selectedFile:null,taskCenter:!1}),this.storage.set("panelOpen",!0)}openFile(t,a=!0){this.patch({panel:"files",panelOpen:!0,selectedFile:t,taskCenter:!1}),a&&this.updateFileUrl(t.id)}updateFileUrl(t){let a=new URL(location.href);t?a.searchParams.set("file",t):a.searchParams.delete("file"),location.href!==a.href&&history.replaceState(history.state,"",a)}togglePanel(){if(this.state.panel==="files"){this.updateFileUrl(null),this.patch({panel:"artifacts",panelOpen:!1,selectedFile:null});return}this.storage.set("panelOpen",!this.state.panelOpen),this.patch({panelOpen:!this.state.panelOpen})}async loadThreads(t=this.state.threadFilter,a=this.state.archived){let n=await Oe(`/threads?limit=200&view=${a?"archived":"active"}&q=${me(t)}`);if(t===this.state.threadFilter&&a===this.state.archived){let l=n.threads||[],r=document.getElementById("cocreation-workbench")?.dataset.scopedTeaching==="true";this.patch({threads:r?l.map(o=>o.latestMessage?{...o,latestMessage:Nc(o.latestMessage)}:o):l})}}filterThreads(t,a=this.state.archived){this.patch({threadFilter:t,archived:a}),this.loadThreads(t,a).catch(this.error)}newThread(){this.state.panel==="files"&&this.togglePanel(),this.epoch++,this.watch?.abort(),this.pendingSubmit=null,this.patch({thread:null,loadingThread:!1,draft:this.storage.draft(null),uploads:[],sidebarOpen:!1,taskCenter:!1,selectedJob:null,error:null}),this.updateUrl(null)}updateUrl(t,a=!1){let n=new URL(location.href);n.searchParams.set("view","conversation"),n.searchParams.delete("artifact"),n.searchParams.delete("file"),n.searchParams.delete("newProject"),n.searchParams.delete("tasks"),t?n.searchParams.set("thread",t):n.searchParams.delete("thread"),location.href!==n.href&&history[a?"replaceState":"pushState"]({},"",n)}async activate(t,a=!0){let n=a?null:new URLSearchParams(location.search).get("file");this.state.panel==="files"&&this.patch({panel:"artifacts",panelOpen:!1,selectedFile:null});let l=++this.epoch;this.watch?.abort(),this.pendingSubmit=null,this.patch({loadingThread:!0,error:null,sidebarOpen:!1,taskCenter:!1,uploads:[]});try{let{thread:r}=await Oe(`/threads/${me(t)}`);if(l!==this.epoch||this.stop)return;if(this.patch({thread:r,draft:this.storage.draft(t,r.context?.learningPattern?.id),selectedJob:r.harnessJobs?.[0]?.id||null}),a)this.updateUrl(t);else if(n){let o=xo(r.messages).find(i=>i.id===n);o?this.openFile(o,!1):this.updateFileUrl(null)}this.watchThread(t,l),await this.loadJobs(t)}finally{l===this.epoch&&this.patch({loadingThread:!1})}}async ensureThread(){if(this.state.thread)return this.state.thread;if(this.creating)return this.creating;let t=this.epoch;return this.creating=this.mutate("/threads",{title:this.state.draft.text.trim().slice(0,70)||"\u65B0\u7684\u6559\u5B66\u521B\u4F5C",phase:"COURSE_SETUP"}).then(({thread:a})=>{if(t!==this.epoch)throw new Error("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u56DE\u5230\u539F\u4F1A\u8BDD\u7EE7\u7EED\u3002");return this.storage.save(a.id,this.state.draft),this.storage.save(null,Fc()),this.patch({thread:a,threads:[a,...this.state.threads]}),this.updateUrl(a.id,!0),this.watchThread(a.id,t),a}).finally(()=>{this.creating=void 0}),this.creating}async refreshThread(t=this.state.thread?.id,a=this.epoch){if(!t)return;let n=await Oe(`/threads/${me(t)}`);a===this.epoch&&this.state.thread?.id===t&&this.patch({thread:n.thread})}watchThread(t,a){this.watch?.abort();let n=new AbortController;this.watch=n,(async()=>{let l=Number(this.state.thread?.lastEventSequence||0),r=0;for(;!this.stop&&!n.signal.aborted&&a===this.epoch;)try{let o=await Oe(`/threads/${me(t)}/events?after=${l}&limit=200&waitMs=15000`,{signal:n.signal});if(n.signal.aborted||a!==this.epoch)break;if(!Number.isSafeInteger(o.nextCursor)||o.nextCursor<l)throw new Error("\u4F1A\u8BDD\u8BB0\u5F55\u6682\u65F6\u65E0\u6CD5\u540C\u6B65\uFF0C\u8BF7\u5237\u65B0\u8BFB\u53D6\u3002");l=o.nextCursor,this.patch({online:!0}),r=0,o.events?.length&&(await this.refreshThread(t,a),await this.loadJobs(t)),o.events?.length||await new Promise(i=>setTimeout(i,300))}catch(o){if(n.signal.aborted||a!==this.epoch)break;if(this.patch({online:!1}),r++,o instanceof vn&&[401,403,404].includes(o.status)){this.error(o);break}await new Promise(i=>setTimeout(i,Math.min(15e3,1500*r)))}})()}schedule(){this.stop||(this.timer=setTimeout(async()=>{if(!document.hidden)try{await this.loadJobs();let t=this.state.jobs.filter(l=>l.threadId===this.state.thread?.id&&!nt(l)),a=this.state.jobs.find(l=>l.id===this.state.selectedJob),n=[...new Set([...t.map(l=>l.id),...a?[a.id]:[]])];await Promise.allSettled(n.slice(0,6).map(l=>this.loadEvents(l)))}catch{this.patch({online:!1})}this.schedule()},this.state.jobs.some(t=>!nt(t))?2200:9e3))}async loadJobs(t){let a=await Oe(`/jobs?view=all&limit=100${t?"&threadId="+me(t):""}`),n=new Map(this.state.jobs.map(i=>[i.id,i])),l=a.jobs||[],r=l.some(i=>nt(i)&&n.has(i.id)&&!nt(n.get(i.id))),o=t?[...l,...this.state.jobs.filter(i=>i.threadId!==t)]:l;this.patch({jobs:o,online:!0}),r&&await Promise.allSettled([this.refreshThread(),this.loadArtifacts(),...this.state.openArtifacts.map(i=>this.loadArtifact(i))])}async deriveDebateCandidates(t,a){let l=(await this.mutate(`/candidate-sets/${me(t)}/derive`,a)).job;return this.patch({jobs:[l,...this.state.jobs.filter(r=>r.id!==l.id)]}),l}async loadEvents(t){if(!this.activeJobReads.has(t)){this.activeJobReads.add(t);try{for(let a=0;a<8;a++){let n=await Oe(`/jobs/${me(t)}/events?limit=128${this.cursor[t]?"&cursor="+me(this.cursor[t]):""}`);if(this.cursor[t]=n.eventCursor||this.cursor[t],this.patch({events:{...this.state.events,[t]:x0(this.state.events[t]||[],n.events||[])},jobs:n.job&&!this.state.jobs.some(l=>l.id===t)?[...this.state.jobs,n.job]:this.state.jobs.map(l=>l.id===t?{...l,...n.job}:l)}),!n.hasMore)break}}catch(a){if(a instanceof vn&&a.code==="INVALID_ACTIVITY_CURSOR")delete this.cursor[t],this.patch({events:{...this.state.events,[t]:[]}});else throw a}finally{this.activeJobReads.delete(t)}}}selectJob(t){this.patch({selectedJob:t}),this.setPanel("activity"),this.loadEvents(t).catch(this.error)}async send(t={},a="auto"){await this.run(async()=>{if(this.state.uploads.length)throw new Error("\u8BF7\u7B49\u5F85\u6587\u4EF6\u4E0A\u4F20\u5B8C\u6210\uFF0C\u6216\u79FB\u9664\u5931\u8D25\u7684\u4E0A\u4F20\u3002");let n=this.state.draft,l=t.content===void 0,r=t.content??n.text.trim();if(a==="ask"&&(!l||!js(n.sources))||!r)return;let o=await this.ensureThread(),i=this.epoch,u=this.state.jobs.find(w=>w.threadId===o.id&&!nt(w)),c=!!t.questionReply,s=c?[]:n.sources.map(({type:w,id:x})=>({type:w,id:x})),f=JSON.stringify(a==="ask"?[o.id,r,s,a]:[o.id,r,n,t]),d=u?{delivery:a==="ask"||c?"after-current":n.delivery,expectedJobId:u.id}:{},p=this.storage.value("pending-submit",null);this.pendingSubmit?.signature!==f&&(this.pendingSubmit=p?.signature===f?p:{signature:f,key:rr(),body:a==="ask"?{content:r,sourceRefs:s,...d,executionMode:a,materialQuestion:!0}:{content:c?r:[...n.skills.map(w=>"/"+w),r].join(`
`),learningPattern:c?"":n.learningPattern,sourceRefs:s,artifactType:c?"auto":n.artifactType,candidateMode:"auto",candidateCount:3,...d,...t,executionMode:a}}),this.storage.set("pending-submit",this.pendingSubmit);let g=await this.mutateMessage(o.id,this.pendingSubmit);this.pendingSubmit=null,this.storage.set("pending-submit",null);let y=l&&this.state.draft===n?{...Fc(),mode:n.mode,learningPattern:n.learningPattern}:this.state.draft;this.storage.save(o.id,y),i===this.epoch&&this.state.thread?.id===o.id&&(this.patch({thread:g.thread||o,draft:y}),g.job&&(this.patch({jobs:[g.job,...this.state.jobs.filter(w=>w.id!==g.job.id)],selectedJob:g.job.id}),this.loadEvents(g.job.id).catch(this.error))),await this.loadThreads()})}mutateMessage(t,a){return Oe(`/threads/${me(t)}/messages`,{method:"POST",body:a.body,key:a.key})}async updateThread(t,a){await this.mutate(`/threads/${me(t)}`,a,"PATCH"),await Promise.all([this.loadThreads(),this.state.thread?.id===t?this.refreshThread():Promise.resolve()])}async setScope(t,a){let n=await this.ensureThread();await this.updateThread(n.id,{dojoId:t?Number(t):null,moduleIndex:a!==void 0&&a!==""?Number(a):null})}async fork(t){let a=await this.mutate(`/threads/${me(t)}/fork`);await this.loadThreads(),await this.activate(a.thread.id),this.notify("\u5DF2\u521B\u5EFA\u5206\u652F\uFF0C\u53EF\u4EE5\u5C1D\u8BD5\u53E6\u4E00\u79CD\u65B9\u5411\u3002")}async editQueue(t,a,n){let l=await this.mutate(`/jobs/${me(t)}/input`,{content:a,revision:n},"PATCH");l.thread?.id===this.state.thread?.id&&this.patch({thread:l.thread})}async cancel(t){await this.mutate(`/jobs/${me(t)}`,{},"DELETE"),await Promise.all([this.loadJobs(),this.refreshThread()])}async retry(t){await this.mutate(`/jobs/${me(t)}/retry`,{idempotencyKey:this.mutationKeys.get("retry:"+t)||this.retryToken(t)}),this.mutationKeys.delete("retry:"+t),delete this.cursor[t],this.patch({events:{...this.state.events,[t]:[]}}),await Promise.all([this.loadJobs(),this.refreshThread()]),this.selectJob(t)}retryToken(t){let a=rr();return this.mutationKeys.set("retry:"+t,a),a}async loadCatalog(t,a=!1){if(!a&&this.catalogLoaded.has(t))return;let n=await Oe(t==="sources"?"/materials?limit=200":"/skills");this.patch(t==="sources"?{materials:n.materials||[]}:{skills:n.skills||n.catalog||[]}),this.catalogLoaded.add(t)}openCatalog(t){this.patch({modal:t}),this.loadCatalog(t).catch(this.error)}async upload(t){let a=await this.ensureThread(),n=this.epoch;for(let l of t){if(n!==this.epoch)break;let r=rr();this.patch({uploads:[...this.state.uploads,{id:r,name:l.name,state:"uploading"}]});try{let o=new FormData;o.set("file",l),o.set("threadId",a.id),o.set("conversationUpload","1"),o.set("stageOnly","1"),o.set("askIntent","0");let i=await Oe("/materials",{method:"POST",body:o});if(!i.materialId)throw new Error("\u4E0A\u4F20\u672A\u8FD4\u56DE\u6587\u4EF6\u6807\u8BC6\uFF0C\u8BF7\u91CD\u8BD5\u3002");if(n!==this.epoch)break;this.setDraft({sources:[...this.state.draft.sources,{id:String(i.materialId),name:l.name,type:"material"}]}),this.patch({uploads:this.state.uploads.filter(u=>u.id!==r)}),this.catalogLoaded.delete("sources")}catch(o){n===this.epoch&&this.patch({uploads:this.state.uploads.map(i=>i.id===r?{...i,state:"error",error:o instanceof Error?o.message:"\u4E0A\u4F20\u672A\u5B8C\u6210"}:i)})}}}async loadArtifacts(){let t=await Oe("/artifacts");this.patch({artifacts:t.artifacts||[]})}async loadArtifact(t){let a=await Oe(`/artifacts/${me(t)}`),n=this.state.artifactDetails[t],l=n&&n.currentRevision!==a.artifact.currentRevision;return this.patch({artifactDetails:{...this.state.artifactDetails,[t]:a.artifact},...l?{previews:{...this.state.previews,[t]:""}}:{}}),a.artifact}async openArtifact(t){this.patch({openArtifacts:[...new Set([...this.state.openArtifacts,t])],selectedArtifact:t}),this.setPanel("artifacts");let a=await this.loadArtifact(t),n=a.type==="simulation"&&a.revision?.content?.teachingWorkshop==="teaching-workshop-v1";this.state.selectedArtifact===t&&(Rc(a)||n)&&["DRAFT","READY","PUBLISHED"].includes(a.status)&&!this.state.previews[t]&&await this.launchPreview(a)}closeArtifact(t){let a=this.state.openArtifacts.filter(n=>n!==t);this.patch({openArtifacts:a,selectedArtifact:this.state.selectedArtifact===t?a.at(-1)||null:this.state.selectedArtifact})}async launchPreview(t){if(t.type==="learning-flow"){this.patch({previews:{...this.state.previews,[t.id]:`/teacher/artifacts/${me(t.id)}?embed=1`}});return}let a=await this.mutate("/runtime/launch",{role:"teacher",dojoId:t.dojoId,moduleIndex:t.moduleIndex,target:`/prep/${me(t.id)}`}),n=new URL(a.launchUrl,location.origin);if(!["http:","https:"].includes(n.protocol))throw new Error("\u9884\u89C8\u5730\u5740\u65E0\u6548\u3002");this.patch({previews:{...this.state.previews,[t.id]:n.href}})}async revise(t,a,n=!1){let l=await this.mutate(`/artifacts/${me(t.id)}/revise`,{instruction:a,expectedRevision:t.currentRevision,...n?{useOriginalSpeakerNotes:!0}:{}});l.job&&this.patch({jobs:[l.job,...this.state.jobs.filter(r=>r.id!==l.job.id)],selectedJob:l.job.id}),this.notify("\u5C40\u90E8\u4FEE\u6539\u5DF2\u63D0\u4EA4\uFF0C\u539F\u7248\u672C\u4FDD\u7559\u3002"),await this.loadArtifact(t.id)}async restore(t,a){await this.mutate(`/artifacts/${me(t.id)}/restore`,{sourceRevision:a,expectedRevision:t.currentRevision}),this.patch({previews:{...this.state.previews,[t.id]:""}}),await this.loadArtifact(t.id),this.notify("\u5DF2\u4ECE\u6240\u9009\u7248\u672C\u521B\u5EFA\u65B0\u8349\u7A3F\u3002")}async prepareClassroom(t,a,n,l){let r=this.state.thread;if(!r||r.id!==t||this.state.loadingThread)return;let o=this.epoch,i=()=>{let p=this.state.thread;return!this.stop&&!this.state.loadingThread&&this.epoch===o&&p?.id===t&&p.status==="ACTIVE"&&p.dojoId===r.dojoId&&p.moduleIndex===r.moduleIndex?p:null},u=()=>{let p=i(),g=p?.messages?.find(y=>y.id===a);return p&&g?zc(p,g,n):null},c=u();if(!c)throw new Error("\u8BFE\u5802\u51C6\u5907\u7684\u8BFE\u4EF6\u3001\u8BFE\u7A0B\u8303\u56F4\u6216\u5BA1\u6279\u5DF2\u53D8\u66F4\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u63D0\u6848\u3002");if(c.sessionId||c.decision==="REJECTED")return;let s=JSON.stringify([t,a,n]);if(this.classroomActions.has(s))return;let f=`/threads/${me(t)}/messages/${a}/tool-proposals/${n}`,d=(p,g)=>{let y=i(),w=u();if(!y||!w||w.approval.id!==c.approval.id||w.approval.sha256!==c.approval.sha256)return!1;let x=y.messages?.map(m=>m.id!==a?m:{...m,metadata:{...m.metadata,[p]:{...m.metadata[p],[String(n)]:g}}});return this.patch({thread:{...y,messages:x}}),!0};this.classroomActions.add(s);try{if(c.decision){if(l)return}else{if(!l)throw new Error("\u8BF7\u5148\u6279\u51C6\u8FD9\u9879\u8BFE\u5802\u51C6\u5907\u3002");let y=await this.mutate(f+"/decision",{decision:l,confirmed:!0,approvalRequest:c.approval});if(!i())return;if(!hh(c.approval,y.decision)||y.decision.decision!==l)throw new Error("\u8BFE\u5802\u51C6\u5907\u672A\u8FD4\u56DE\u53EF\u9A8C\u8BC1\u7684\u5BA1\u6279\u8BB0\u5F55\uFF0C\u8BF7\u5237\u65B0\u540E\u67E5\u770B\u3002");if(!d("toolProposalDecisions",y.decision)||l==="REJECTED")return}let p=u();if(!p||p.decision!=="APPROVED"||p.sessionId||p.approval.id!==c.approval.id||p.approval.sha256!==c.approval.sha256)return;let g=await this.mutate(f+"/prepare-classroom",{approvalRequest:p.approval});if(!i())return;if(!gh(g.sessionId)||g.artifactId!==p.artifactId||g.artifactRevision!==p.revision)throw new Error("\u8BFE\u5802\u51C6\u5907\u672A\u8FD4\u56DE\u53EF\u9A8C\u8BC1\u7684\u4F1A\u8BDD\uFF0C\u53EF\u91CD\u8BD5\u539F\u8BF7\u6C42\u3002");d("toolExecutionResults",{tool:"classroom.prepare",status:"SUCCEEDED",sessionId:g.sessionId,artifactId:g.artifactId,artifactRevision:g.artifactRevision})}catch(p){if(!i())return;if(await this.refreshThread(t,o).catch(()=>{}),i())throw p}finally{this.classroomActions.delete(s)}}async approve(t,a,n){let l=this.state.thread?.id;l&&(await this.mutate(`/threads/${me(l)}/messages/${t}/tool-proposals/${a}/decision`,{decision:n,confirmed:!0,approvalRequest:this.state.thread?.messages?.find(r=>r.id===t)?.metadata.toolProposalApprovalRequests?.[String(a)]}),await this.refreshThread(l))}async selectOption(t,a,n){let l=this.state.thread?.id;if(!l)return;let r={sourceMessageId:t,optionId:a},o=await this.mutate(`/threads/${me(l)}/messages/${t}/generation-options/${me(a)}/select`);if(o.proposal?.tool==="candidate.generate"){let i=o.proposal.arguments||{};await this.mutate(`/threads/${me(l)}/messages`,{agentContinuation:!0,action:"generate",content:i.prompt,artifactType:i.artifactType,candidateMode:Number(i.candidateCount||1)>1?"multiple":"single",candidateCount:Number(i.candidateCount||1),sourceRefs:i.sourceRefs||[],generationSelection:r})}else if(o.proposal?.tool){if(o.proposal.tool==="challenge.generate"&&!n)throw new Error("\u8BF7\u5148\u5BA1\u9605\u5E76\u786E\u8BA4\u6BCF\u9053\u9898\u7684\u6807\u9898\u4E0E\u96BE\u5EA6\u3002");let i=await this.mutate("/agent-tools/execute",{threadId:l,tool:o.proposal.tool,arguments:o.proposal.arguments||{},confirmed:!!o.proposal.requiresConfirmation,sourceJobId:o.sourceJobId,generationSelection:r,generationPlan:n});if(i.action?.id){let u=i.action;for(let c=0;c<12&&["PENDING","QUEUED","RUNNING"].includes(u.status);c++)await new Promise(s=>setTimeout(s,700)),u=(await Oe(`/agent-tools/actions/${me(u.id)}`)).action;if(u.status==="FAILED")throw new Error(u.error||"\u65B9\u6848\u6267\u884C\u5931\u8D25\uFF0C\u53EF\u5728\u4EFB\u52A1\u4E2D\u5FC3\u7EE7\u7EED\u3002")}}await Promise.all([this.refreshThread(l),this.loadJobs()])}async saveAppearance(t,a){await mh("/users/settings",{method:"PATCH",body:{preferences:{appearance:t,palette:a}}}),window.AISecEduUI?.applyAppearance(t,a,!0),this.notify("\u5916\u89C2\u5DF2\u4FDD\u5B58\u3002")}};var U0=`:host {
  --canvas: var(--ui-bg);
  --rail: var(--ui-surface);
  --raised: var(--ui-surface-raised);
  --soft: var(--ui-field);
  --hover: var(--ui-surface-hover);
  --ink: var(--ui-text);
  --muted: var(--ui-text-muted);
  --line: var(--ui-border-soft);
  --border: var(--ui-border);
  --accent: var(--brand-green);
  --accent-soft: color-mix(in srgb, var(--brand-green) 10%, var(--ui-field));
  --teacher-bubble: color-mix(in srgb, var(--accent) 9%, var(--raised));
  --danger: var(--theme-danger);
  --success: var(--theme-success);
  --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  color: var(--ink);
  font: inherit;
  font-size: 1rem;
  line-height: 1.6;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
* {
  box-sizing: border-box;
}
[hidden] {
  display: none !important;
}
button,
input,
textarea,
select {
  font: inherit;
  color: inherit;
}
button,
a,
input,
select,
textarea,
summary {
  -webkit-tap-highlight-color: transparent;
}
button {
  cursor: pointer;
  background: none;
  border: 0;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
button:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
summary:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
input,
textarea,
select {
  background: var(--ui-field);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 10px;
  min-width: 0;
}
textarea {
  resize: vertical;
}
input::placeholder,
textarea::placeholder {
  color: var(--muted);
  opacity: 0.8;
}
a {
  color: var(--accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
svg {
  flex-shrink: 0;
  vertical-align: middle;
}
h1,
h2,
h3,
h4,
p {
  margin: 0;
}
h1 {
  font-size: clamp(1.6rem, 3vw, 2.15rem);
  font-weight: 600;
  line-height: 1.35;
}
h2 {
  font-size: 16px;
  font-weight: 600;
}
h3 {
  font-size: 14px;
  font-weight: 600;
}
h4 {
  font-size: var(--ae-type-caption);
}
small {
  font-size: var(--ae-type-caption);
}
code,
pre {
  font-family: var(--mono);
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
}
summary {
  cursor: pointer;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0 0 16px;
  min-width: 0;
}
legend {
  padding: 0;
  font-size: 0.875rem;
  margin-bottom: 9px;
}
kbd {
  font-family: inherit;
  color: var(--muted);
  font-size: var(--ae-type-caption);
  white-space: nowrap;
}
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 7px;
  min-height: 38px;
  padding: 5px 10px;
  color: var(--ink);
  font-size: 0.875rem;
  line-height: 1.5;
  text-decoration: none;
}
.button:hover:not(:disabled) {
  background: var(--hover);
  text-decoration: none;
}
.button.primary {
  background: var(--accent);
  color: var(--theme-on-primary);
  font-weight: 550;
}
.button.primary:hover:not(:disabled) {
  background: var(--theme-primary-strong);
}
.button.selected,
.selected > .thread-link {
  color: var(--ink);
  background: var(--soft);
}
.icon-button {
  padding: 5px;
  width: 38px;
  height: 38px;
  min-height: 38px;
  flex-shrink: 0;
}
.push {
  margin-left: auto;
}
.quiet {
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.button-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.spin {
  animation: spin 1.3s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
#workbench-root {
  height: 100%;
}
.workbench {
  --sidebar-width: 286px;
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--canvas);
}
.workbench.has-panel {
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr) 4px minmax(340px, min(var(--panel-width), 48vw));
}
.workbench.sidebar-collapsed {
  --sidebar-width: 0px;
}
.sidebar-collapsed > .sidebar {
  display: none;
}
.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--rail);
  min-height: 0;
  border-right: 1px solid var(--line);
  padding: 0;
}
.agent-mark {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border-radius: 8px;
  color: var(--theme-on-primary);
  background: var(--accent);
}
.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--line);
}
.sidebar-actions .button {
  width: 100%;
  justify-content: flex-start;
  gap: 10px;
  min-height: 42px;
  font-weight: 500;
}
.sidebar-actions .new-thread {
  background: var(--canvas);
  border-color: var(--border);
  margin: 0 0 8px;
  box-shadow: none;
  min-height: 44px;
  border-radius: 8px;
}
.sidebar-actions kbd {
  margin-left: auto;
}
.sidebar-actions .thread-search {
  margin-bottom: 8px;
  border-color: var(--line);
  border-radius: 8px;
  background: var(--soft);
  color: var(--muted);
}
.sidebar-actions svg {
  color: var(--accent);
}
.count {
  margin-left: auto;
  background: var(--accent-soft);
  color: var(--accent);
  min-width: 19px;
  text-align: center;
  border-radius: 5px;
  font-size: var(--ae-type-caption);
}
.sidebar-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 5px;
  color: var(--muted);
}
.sidebar-section-heading .button {
  color: var(--muted);
  font-size: var(--ae-type-caption);
  padding-left: 3px;
}
.thread-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 7px 14px;
  scrollbar-width: thin;
}
.thread-list section > h3 {
  font-size: var(--ae-type-caption);
  font-weight: 500;
  color: var(--muted);
  padding: 14px 9px 6px;
}
.thread-row {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: 7px;
  margin: 1px 0;
}
.thread-row:hover,
.thread-row.selected {
  background: var(--hover);
}
.thread-link {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  min-width: 0;
  flex: 1;
  padding: 8px 34px 8px 9px;
  min-height: 66px;
  border-radius: 7px;
  font-size: var(--ae-type-caption);
}
.thread-link > span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thread-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.thread-copy strong,
.thread-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.thread-copy strong {
  font-weight: 620;
  padding-right: 34px;
}
.thread-copy small,
.thread-link time {
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.thread-link time {
  position: absolute;
  top: 8px;
  right: 9px;
  max-width: 56px;
  overflow: hidden;
  white-space: nowrap;
}
.thread-link svg {
  color: var(--muted);
}
.thread-more {
  position: absolute;
  right: 5px;
  bottom: 6px;
  height: 26px;
  min-height: 26px;
  background: var(--hover);
  opacity: 0;
  width: 26px;
  min-height: 26px;
  height: 26px;
  margin-right: 3px;
}
.thread-row:hover .thread-more,
.thread-row:focus-within .thread-more,
.thread-row.selected .thread-more {
  opacity: 1;
}
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  margin-left: auto;
}
.thread-menu {
  position: absolute;
  top: 35px;
  right: 0;
  min-width: 158px;
  z-index: 5;
  padding: 5px;
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: 9px;
  box-shadow: 0 8px 24px var(--ui-shadow);
}
.thread-menu .button {
  display: flex;
  width: 100%;
  justify-content: flex-start;
}
.sidebar-empty {
  padding: 10px;
}
.main-pane {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.workspace-header {
  min-height: 66px;
  flex-shrink: 0;
  padding: 9px 18px;
  background: var(--rail);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 10px;
}
.workspace-breadcrumb {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  font-size: 1rem;
}
.workspace-breadcrumb > span {
  color: var(--muted);
  white-space: nowrap;
}
.workspace-breadcrumb > svg {
  color: var(--muted);
}
.workspace-breadcrumb strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 550;
}
.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 3px;
}
.offline {
  color: var(--theme-warning);
  display: flex;
  gap: 5px;
  align-items: center;
  font-size: var(--ae-type-caption);
  white-space: nowrap;
}
.notice {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 7px 16px;
  font-size: var(--ae-type-caption);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
}
.notice.error {
  background: color-mix(in srgb, var(--danger) 9%, var(--canvas));
  color: var(--danger);
}
.notice span {
  overflow-wrap: anywhere;
}
.workspace-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
}
.welcome {
  width: 100%;
  margin: 0 auto;
  padding: 30px 20px;
  max-width: 900px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}
.welcome-heading {
  margin: 0 0 28px;
}
.welcome-symbol {
  color: var(--accent);
  display: block;
  margin: 0 0 18px;
}
.welcome h1 {
  letter-spacing: -0.5px;
  font-size: clamp(1.6rem, 3vw, 2.15rem);
}
.welcome-heading p {
  color: var(--muted);
  font-size: 1rem;
  line-height: 1.7;
  margin-top: 10px;
}
.composer-area {
  padding: 9px clamp(16px, 4vw, 52px) 11px;
  width: 100%;
  flex-shrink: 0;
  border-top: 1px solid var(--line);
  background: var(--rail);
}
.composer-area > * {
  width: min(100%, 900px);
  margin-right: auto;
  margin-left: auto;
}
.composer {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--ui-field);
  box-shadow: 0 3px 12px var(--ui-shadow);
}
.composer:focus-within {
  border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
}
.composer.dragging {
  border: 2px dashed var(--accent);
  background: var(--accent-soft);
}
.composer textarea {
  display: block;
  padding: 14px 64px 8px 14px;
  min-height: 58px;
  width: 100%;
  max-height: 200px;
  border: 0;
  background: transparent;
  outline: none;
  resize: none;
  font-size: 1rem;
  line-height: 1.55;
  box-shadow: none;
}
#workbench-prompt:focus,
#workbench-prompt:focus-visible {
  outline: 0 !important;
  outline-offset: 0;
  box-shadow: none !important;
}
.composer-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px 8px;
  min-height: 38px;
  flex-wrap: wrap;
}
.composer-toolbar .teaching-project-button {
  min-height: 32px;
  padding: 4px 8px;
  font-size: var(--ae-type-caption);
}
.composer-toolbar select {
  border: 0;
  padding: 5px 3px;
  font-size: var(--ae-type-caption);
  background: transparent;
  max-width: 118px;
}
.add-context {
  position: relative;
}
.composer-menu {
  position: absolute;
  bottom: 38px;
  left: -1px;
  z-index: 4;
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 5px;
  width: 168px;
  box-shadow: 0 8px 24px var(--ui-shadow);
}
.composer-menu .button {
  width: 100%;
  justify-content: flex-start;
}
.button.send-button {
  position: absolute;
  bottom: 44px;
  right: 8px;
  background: var(--accent);
  color: var(--theme-on-primary);
  border-radius: 8px;
  width: 42px;
  height: 42px;
  padding: 5px;
  flex-shrink: 0;
}
.button.send-button:disabled {
  background: var(--accent);
  color: var(--theme-on-primary);
  opacity: 0.55;
}
.stop-button {
  background: var(--soft);
}
.composer-footnote {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin: 9px 3px 0;
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.composer-footnote > span:first-child:not(:last-child) {
  margin-right: auto;
}
.composer-footnote > span:last-child {
  white-space: nowrap;
}
.context-chips {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  padding: 11px 12px 0;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--line);
  background: var(--raised);
  border-radius: 6px;
  color: var(--muted);
  padding: 2px 5px 2px 7px;
  font-size: var(--ae-type-caption);
  max-width: 100%;
}
.chip > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 190px;
}
.chip .icon-button {
  width: 20px;
  height: 20px;
  min-height: 20px;
  padding: 2px;
}
.chip.error {
  color: var(--danger);
}
.starter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 25px 0 45px;
  gap: 8px;
}
.starter-grid .button {
  text-align: left;
  padding: 12px 10px;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 8px;
  border: 1px solid var(--line);
  background: var(--raised);
  border-radius: 10px;
}
.starter-grid svg {
  margin-top: 3px;
  width: 34px;
  height: 34px;
  padding: 8px;
  border-radius: 7px;
  color: var(--accent);
  background: var(--accent-soft);
}
.starter-grid strong,
.starter-grid small {
  display: block;
}
.starter-grid strong {
  font-size: var(--ae-type-caption);
  font-weight: 550;
}
.starter-grid small {
  margin-top: 3px;
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.recent-work > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  padding-bottom: 10px;
}
.recent-work h2 {
  font-size: var(--ae-type-caption);
  color: var(--muted);
  font-weight: 500;
}
.recent-work header .button {
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.recent-work > button {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}
.recent-work > button:hover {
  background: var(--raised);
}
.recent-work strong {
  font-size: var(--ae-type-caption);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.recent-work button > span,
.recent-work small {
  font-size: var(--ae-type-caption);
  color: var(--muted);
  white-space: nowrap;
}
.recent-work > p {
  margin: 16px 0;
}
.conversation {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.transcript-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
  scrollbar-width: thin;
}
.transcript {
  max-width: 872px;
  margin: 0 auto;
  padding: 32px clamp(16px, 4vw, 46px) 24px;
}
.message {
  margin-bottom: 28px;
}
.user-message {
  display: grid;
  justify-items: end;
}
.message-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.message-meta strong {
  font-size: var(--ae-type-caption);
  font-weight: 600;
}
.message-meta time {
  margin-left: 4px;
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.user-message .message-meta {
  flex-direction: row-reverse;
}
.avatar {
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--rail);
  color: var(--accent);
  display: grid;
  place-items: center;
}
.avatar.user {
  color: var(--muted);
  background: var(--soft);
  font-size: var(--ae-type-caption);
  border-radius: 7px;
}
.message-body {
  padding-left: 44px;
  min-width: 0;
}
.message-body > .markdown {
  max-width: 71ch;
  padding: 1px 0;
}
.user-message .message-body {
  width: fit-content;
  max-width: min(82%, 67ch);
  padding: 0 0 0 12px;
}
.user-message .message-body > .markdown {
  background: var(--teacher-bubble);
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line));
  border-radius: 16px 5px 16px 16px;
  padding: 11px 15px;
}
.user-message .message-actions {
  justify-content: flex-end;
}
.markdown {
  overflow-wrap: anywhere;
  line-height: 1.7;
  font-size: 0.9375rem;
}
.markdown p {
  margin: 0 0 12px;
}
.markdown p:last-child {
  margin-bottom: 0;
}
.markdown ul,
.markdown ol {
  margin: 8px 0 15px;
  padding-left: 22px;
}
.markdown li {
  margin: 4px 0;
}
.markdown h1,
.markdown h2,
.markdown h3 {
  margin: 20px 0 10px;
  line-height: 1.5;
}
.markdown h1 {
  font-size: 20px;
}
.markdown h2 {
  font-size: 17px;
}
.markdown h3 {
  font-size: 15px;
}
.markdown pre {
  background: var(--soft);
  padding: 13px 15px;
  border: 1px solid var(--line);
  border-radius: 8px;
  margin: 12px 0;
  font-size: var(--ae-type-caption);
  line-height: 1.7;
}
.markdown :not(pre) > code {
  background: var(--soft);
  border-radius: 4px;
  padding: 2px 4px;
  font-size: 0.93em;
}
.markdown blockquote {
  margin: 14px 0;
  padding: 5px 14px;
  border-left: 3px solid var(--border);
  color: var(--muted);
}
.markdown table {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: var(--ae-type-caption);
}
.markdown td,
.markdown th {
  padding: 7px 10px;
  border: 1px solid var(--line);
}
.markdown th {
  background: var(--raised);
}
.markdown hr {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 20px 0;
}
.tag {
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 5px;
  font-size: var(--ae-type-caption);
}
.message-actions {
  display: flex;
  gap: 2px;
  margin: 9px 0 0;
  color: var(--muted);
}
.message-actions .icon-button {
  width: 25px;
  height: 25px;
  min-height: 25px;
}
.run-summary {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 33px;
  text-align: left;
  padding: 5px 0;
  color: var(--muted);
  margin: 1px 0 10px;
  font-size: var(--ae-type-caption);
}
.run-summary > span:nth-child(2) {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.run-summary:hover {
  color: var(--accent);
}
.status {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-size: var(--ae-type-caption);
  white-space: nowrap;
  color: var(--muted);
}
.status.running {
  color: var(--accent);
}
.status.failed {
  color: var(--danger);
}
.status.done {
  color: var(--success);
}
.pending-text {
  padding: 10px 0;
}
.plan-block {
  margin: 0 0 15px;
  padding: 0 0 10px;
  border-bottom: 1px solid var(--line);
}
.plan-block summary {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.plan-block summary span {
  margin-left: auto;
  font-size: var(--ae-type-caption);
}
.plan-block ol {
  font-size: var(--ae-type-caption);
  margin: 12px 0 0;
  padding-left: 20px;
}
.plan-block li {
  margin: 5px 0;
}
.options-block,
.question-block,
.approval-block {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 15px;
  margin-top: 18px;
  background: var(--raised);
}
.options-block > header {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: var(--ae-type-caption);
}
.options-block > header > span {
  margin-left: auto;
  font-size: var(--ae-type-caption);
}
.option-tabs {
  display: flex;
  gap: 4px;
  margin: 15px 0;
  border-bottom: 1px solid var(--line);
}
.option-tabs button {
  flex: 1;
  padding: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  font-size: var(--ae-type-caption);
  border-bottom: 2px solid transparent;
}
.option-tabs button[aria-selected='true'] {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.option-content h3 {
  font-size: 15px;
  margin-bottom: 8px;
}
.option-content p,
.option-content ul {
  font-size: var(--ae-type-caption);
  line-height: 1.8;
  color: var(--muted);
}
.option-content ul {
  padding-left: 20px;
  margin: 8px 0;
}
.option-content details,
.approval-block details {
  margin: 14px 0;
  font-size: var(--ae-type-caption);
}
.option-content details .markdown {
  padding-top: 12px;
  font-size: var(--ae-type-caption);
}
.refine-options {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: var(--ae-type-caption);
}
.refine-options textarea {
  display: block;
  width: 100%;
  margin: 10px 0;
}
.question-block { max-width: 660px; border-color: color-mix(in srgb, var(--accent) 36%, var(--line)); padding: 14px; }
.question-header { display: flex; justify-content: space-between; color: var(--accent); font-size: 0.82rem; }
.question-header span { color: var(--muted); font-variant-numeric: tabular-nums; }
.question-block fieldset { border: 0; padding: 0; margin: 10px 0 0; min-width: 0; }
.question-block legend { font-size: 1rem; line-height: 1.44; font-weight: 640; margin-bottom: 12px; }
.question-block textarea { width: 100%; margin-top: 8px; }
.question-block footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 13px; }
.question-custom { color: var(--accent); padding: 6px 3px; font-size: .875rem; }
.question-complete { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: .82rem; margin: 8px 0; }
.choice-list {
  display: grid;
  gap: 6px;
}
.choice-list button {
  display: flex;
  align-items: center;
  text-align: left;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  background: var(--rail);
  border-radius: 8px;
  font-size: .9rem;
}
.choice-list button:hover { border-color: var(--accent); }
.choice-list small { color: var(--muted); display: block; line-height: 1.35; }
.choice-indicator { width: 18px; height: 18px; border: 1px solid var(--border); border-radius: 50%; flex: none;
  display: grid; place-items: center; color: var(--accent); }
.choice-list .selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.approval-block {
  border-color: color-mix(in srgb, var(--theme-warning) 45%, var(--border));
}
.approval-block h3 {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--theme-warning);
  margin-bottom: 8px;
}
.approval-block p {
  font-size: var(--ae-type-caption);
}
.result-card {
  display: flex;
  gap: 13px;
  align-items: center;
  text-align: left;
  width: 100%;
  max-width: 610px;
  padding: 14px;
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--raised);
}
.result-card:hover {
  border-color: var(--accent);
}
.result-card > svg:first-child {
  color: var(--accent);
}
.result-card > span {
  flex: 1;
  min-width: 0;
}
.result-card > .result-glyph {
  flex: none;
  width: 39px;
  height: 39px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: var(--accent);
  background: var(--accent-soft);
}
.result-card small,
.result-card strong,
.result-card span > span {
  display: block;
}
.result-card small,
.result-card span > span {
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.result-card strong {
  font-size: 0.875rem;
  margin: 3px 0;
}
.file-result {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ae-type-caption);
  padding: 8px;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 7px;
  margin: 8px 0;
}
.jump-latest {
  position: absolute;
  bottom: 180px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 3px 12px var(--ui-shadow);
  font-size: var(--ae-type-caption);
}
.queue-dock {
  border: 1px solid var(--line);
  border-bottom: 0;
  border-radius: 12px 12px 0 0;
  margin: 0 8px -4px;
  padding: 8px 8px 12px;
  background: var(--raised);
  max-height: 220px;
  overflow-y: auto;
}
.queue-row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 5px;
}
.queue-row > svg {
  margin-top: 4px;
  color: var(--muted);
}
.queue-row > div {
  flex: 1;
  min-width: 0;
}
.queue-row small {
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.queue-row p {
  font-size: var(--ae-type-caption);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.queue-row textarea {
  width: 100%;
  font-size: var(--ae-type-caption);
}
.archive-notice {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-resizer {
  width: 4px;
  background: var(--line);
  cursor: col-resize;
  touch-action: none;
  z-index: 3;
}
.panel-resizer:hover,
.panel-resizer:focus-visible {
  background: var(--accent);
}
.work-area {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--canvas);
}
.panel-header {
  display: flex;
  align-items: center;
  height: 56px;
  flex-shrink: 0;
  padding: 0 10px;
  gap: 2px;
  border-bottom: 1px solid var(--line);
}
.panel-header > div {
  display: flex;
  align-items: stretch;
  gap: 4px;
  flex: 1;
  height: 100%;
}
.panel-header [role='tab'] {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border-bottom: 2px solid transparent;
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.panel-header [aria-selected='true'] {
  border-bottom-color: var(--accent);
  color: var(--ink);
}
.panel-content {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.panel-scroll {
  min-height: 0;
  overflow-y: auto;
  flex: 1;
  scrollbar-width: thin;
}
.panel-note {
  color: var(--muted);
  font-size: var(--ae-type-caption);
  border-top: 1px solid var(--line);
  padding: 9px 14px;
  flex-shrink: 0;
}
.expanded-panel .work-area {
  position: absolute;
  inset: 0 0 0 var(--sidebar-width);
  z-index: 8;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  padding: 35px 28px;
  margin: auto;
  min-height: 250px;
}
.empty-state > svg {
  color: var(--muted);
}
.empty-state > strong {
  font-size: 14px;
  font-weight: 550;
}
.empty-state > div {
  color: var(--muted);
  font-size: var(--ae-type-caption);
  max-width: 280px;
}
.empty-state .button {
  margin-top: 18px;
}
.artifact-panel,
.artifact-workspace,
.activity-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.artifact-tabs {
  display: flex;
  gap: 0;
  align-items: stretch;
  min-height: 38px;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
  background: var(--rail);
  flex-shrink: 0;
  scrollbar-width: thin;
}
.artifact-tabs > button,
.artifact-tabs > div {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  border-right: 1px solid var(--line);
}
.artifact-tabs [role='tab'] {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ae-type-caption);
  padding: 8px 12px;
  max-width: 190px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--muted);
}
.artifact-tabs .active,
.artifact-tabs > button[aria-selected='true'] {
  background: var(--canvas);
}
.artifact-tabs [aria-selected='true'] {
  color: var(--ink);
}
.artifact-tabs .icon-button {
  margin-right: 3px;
  width: 22px;
  height: 22px;
  min-height: 22px;
}
.artifact-library {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.search-field {
  display: flex;
  gap: 7px;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--canvas);
  padding: 0 9px;
  color: var(--muted);
}
.search-field input {
  border: 0;
  outline: none;
  background: transparent;
  width: 100%;
  padding: 8px 0;
  font-size: var(--ae-type-caption);
}
.artifact-library > .search-field {
  margin: 14px;
}
.artifact-list-row {
  display: flex;
  width: 100%;
  align-items: center;
  text-align: left;
  gap: 11px;
  padding: 15px;
  border-bottom: 1px solid var(--line);
}
.artifact-list-row:hover {
  background: var(--raised);
}
.artifact-list-row > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.artifact-list-row strong {
  display: block;
  font-size: var(--ae-type-caption);
  font-weight: 550;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.artifact-list-row small {
  display: block;
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin-top: 5px;
}
.file-icon {
  display: grid;
  place-items: center;
  width: 33px;
  height: 40px;
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--accent);
}
.artifact-title {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid var(--line);
}
.artifact-title > div {
  flex: 1;
  min-width: 0;
}
.artifact-title strong {
  font-size: 0.875rem;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artifact-title small {
  display: block;
  color: var(--muted);
  font-size: var(--ae-type-caption);
  margin-top: 3px;
}
.artifact-subtabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 11px;
  height: 38px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.artifact-subtabs > button[role='tab'] {
  display: flex;
  gap: 5px;
  align-items: center;
  color: var(--muted);
  padding: 9px;
  font-size: var(--ae-type-caption);
  height: 100%;
  border-bottom: 2px solid transparent;
}
.artifact-subtabs > button[aria-selected='true'] {
  color: var(--accent);
  border-color: var(--accent);
}
.artifact-subtabs > .icon-button {
  margin-left: auto;
}
.artifact-content {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}
.preview-area {
  flex: 1;
  min-height: 0;
  display: flex;
  background: var(--rail);
}
.preview-area iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--canvas);
}
.source-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.source-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ae-type-caption);
  color: var(--muted);
  padding: 8px 12px;
  background: var(--raised);
  border-bottom: 1px solid var(--line);
}
.source-editor {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
  resize: none;
  font: 11px/1.8 var(--mono);
  background: var(--canvas);
  color: var(--ink);
  padding: 15px;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
}
.history-area {
  overflow-y: auto;
  min-height: 0;
  flex: 1;
}
.revision-row {
  padding: 14px;
  display: flex;
  gap: 9px;
  align-items: center;
  border-bottom: 1px solid var(--line);
}
.revision-badge {
  font-size: var(--ae-type-caption);
  padding: 3px 7px;
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 5px;
}
.revision-row > div {
  flex: 1;
  min-width: 0;
}
.revision-row strong {
  display: block;
  font-size: var(--ae-type-caption);
  font-weight: 500;
  overflow-wrap: anywhere;
  max-height: 48px;
  overflow: hidden;
}
.revision-row small {
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.revision-row .button {
  font-size: var(--ae-type-caption);
}
.revision-compare > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: var(--ae-type-caption);
  border-bottom: 1px solid var(--line);
}
.diff-view {
  font-size: var(--ae-type-caption);
  line-height: 1.6;
}
.diff-view pre {
  display: flex;
  gap: 6px;
  padding: 3px 9px;
}
.diff-view pre > span {
  flex: 0 0 10px;
  user-select: none;
}
.diff-view code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.diff-added {
  background: color-mix(in srgb, var(--success) 12%, var(--canvas));
  color: var(--success);
}
.diff-removed {
  background: color-mix(in srgb, var(--danger) 10%, var(--canvas));
  color: var(--danger);
}
.diff-same {
  color: var(--muted);
}
.diff-large {
  padding: 12px;
}
.revision-composer {
  border-top: 1px solid var(--line);
  padding: 12px 14px;
  flex-shrink: 0;
}
.revision-context {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  font-size: var(--ae-type-caption);
}
.revision-context > span {
  color: var(--muted);
}
.revision-input {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 5px;
  align-items: flex-end;
  gap: 5px;
  background: var(--ui-field);
}
.revision-input textarea {
  resize: vertical;
  min-height: 56px;
  max-height: 160px;
  border: 0;
  padding: 6px;
  flex: 1;
  font-size: var(--ae-type-caption);
  outline: none;
  background: transparent;
}
.revision-composer > small {
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin-top: 7px;
  display: block;
}
.panel-toolbar {
  display: flex;
  padding: 10px;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--line);
}
.panel-toolbar select {
  flex: 1;
  font-size: var(--ae-type-caption);
  border-color: var(--line);
}
.activity-job {
  padding: 13px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.activity-job > progress {
  width: 100%;
  height: 4px;
  accent-color: var(--accent);
}
.activity-filters {
  display: flex;
  gap: 6px;
  align-items: center;
  border-bottom: 1px solid var(--line);
  padding: 0 11px 10px;
}
.activity-filters > svg {
  color: var(--muted);
}
.activity-filters select,
.activity-filters input {
  font-size: var(--ae-type-caption);
  padding: 5px;
  border-color: var(--line);
}
.activity-filters select {
  max-width: 120px;
}
.activity-filters input {
  flex: 1;
  width: 70px;
}
.activity-row {
  border-bottom: 1px solid var(--line);
}
.activity-row > summary {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 13px;
}
.activity-row > summary:hover {
  background: var(--raised);
}
.activity-row > summary > svg {
  margin-top: 3px;
  color: var(--muted);
}
.activity-row > summary > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.activity-row strong {
  display: block;
  font-size: var(--ae-type-caption);
  font-weight: 500;
}
.activity-row summary code {
  display: block;
  color: var(--muted);
  font-size: var(--ae-type-caption);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.activity-row summary > .status {
  font-size: var(--ae-type-caption);
  padding-top: 2px;
}
.activity-detail {
  margin: 0 12px 13px 36px;
  font-size: var(--ae-type-caption);
}
.activity-detail h4 {
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin: 12px 0 5px;
}
.code {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px;
  font-size: var(--ae-type-caption);
  line-height: 1.7;
  max-height: 420px;
  overflow: auto;
}
.command-line {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 9px 0;
}
.command-line code {
  flex: 1;
  overflow-wrap: anywhere;
  font-size: var(--ae-type-caption);
}
.exit-code {
  color: var(--muted);
  font-size: var(--ae-type-caption);
  margin-top: 8px;
}
.context-panel {
  padding: 22px 20px;
}
.section-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.section-heading h2 {
  font-size: 14px;
}
.context-panel > section {
  border-bottom: 1px solid var(--line);
  padding: 24px 0;
}
.context-panel section > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.context-panel h3 {
  margin-bottom: 12px;
  font-size: var(--ae-type-caption);
  display: flex;
  gap: 6px;
  align-items: center;
}
.context-panel section > p {
  margin: 8px 0 12px;
}
.context-item {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 8px 0;
  font-size: var(--ae-type-caption);
}
.context-item > span {
  flex: 1;
  overflow-wrap: anywhere;
}
.context-panel > a {
  margin-top: 17px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin: 14px 0;
}
.field input,
.field select {
  color: var(--ink);
  width: 100%;
}
.task-center {
  padding: 35px 28px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.task-center > header > div {
  display: flex;
  gap: 11px;
  align-items: center;
}
.task-center h1 {
  font-size: 22px;
}
.task-center header p {
  color: var(--muted);
  font-size: var(--ae-type-caption);
  margin-top: 10px;
  max-width: 560px;
}
.task-filters {
  display: flex;
  gap: 14px;
  align-items: center;
  margin: 28px 0 18px;
  flex-wrap: wrap;
}
.segmented {
  display: flex;
  gap: 3px;
  background: var(--rail);
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.segmented button {
  padding: 5px 10px;
  font-size: var(--ae-type-caption);
  border-radius: 5px;
  color: var(--muted);
}
.segmented button[aria-pressed='true'] {
  background: var(--canvas);
  box-shadow: 0 1px 3px var(--ui-shadow);
  color: var(--ink);
}
.task-filters .search-field {
  flex: 1;
  min-width: 150px;
}
.task-row {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 18px 0;
  border-bottom: 1px solid var(--line);
}
.task-icon {
  color: var(--muted);
  padding-top: 2px;
}
.task-info {
  flex: 1;
  min-width: 0;
}
.task-info strong {
  display: block;
  font-size: 0.875rem;
  font-weight: 550;
}
.task-info p {
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin: 5px 0;
  overflow-wrap: anywhere;
}
.task-info small {
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.task-info details {
  font-size: var(--ae-type-caption);
  margin-top: 10px;
}
.task-info pre {
  color: var(--danger);
  padding-top: 9px;
}
.task-actions {
  display: flex;
  gap: 2px;
}
.task-limit {
  margin-top: 15px;
  font-size: var(--ae-type-caption);
}
.modal-layer {
  position: fixed;
  inset: 0;
  background: var(--ui-overlay);
  z-index: 30;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: min(12vh, 100px) 16px 30px;
  overflow-y: auto;
}
.dialog {
  background: var(--rail);
  border: 1px solid var(--border);
  width: 520px;
  max-width: 100%;
  border-radius: 8px;
  box-shadow: 0 24px 70px var(--ui-shadow);
  max-height: 82dvh;
  display: flex;
  flex-direction: column;
}
.dialog.wide {
  width: 840px;
}
.dialog > header {
  background: var(--raised);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.dialog > header h2 {
  font-size: 14px;
}
.dialog > form {
  padding: 5px 20px 0;
}
.dialog-body {
  padding: 20px;
  overflow-y: auto;
  font-size: 0.875rem;
}
.dialog-body > h3 {
  margin-bottom: 14px;
}
.dialog-body > p {
  margin-bottom: 10px;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 9px;
  padding: 14px 18px;
  border-top: 1px solid var(--line);
}
.dialog-actions > .quiet {
  margin-right: auto;
}
.command-search {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 18px;
  color: var(--muted);
  flex-shrink: 0;
}
.command-search input {
  border: 0;
  outline: none;
  flex: 1;
  background: transparent;
  font-size: 14px;
  padding: 8px 0;
}
.command-results {
  padding: 0 9px 14px;
  overflow-y: auto;
}
.command-results h3 {
  color: var(--muted);
  font-weight: 500;
  font-size: var(--ae-type-caption);
  padding: 14px 10px 7px;
}
.command-results .button {
  display: flex;
  width: 100%;
  justify-content: flex-start;
  text-align: left;
  padding: 9px 10px;
}
.command-results .button > span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.command-results kbd {
  margin-left: auto;
}
.catalog-list {
  overflow-y: auto;
  padding: 0 12px 16px;
}
.catalog-item {
  display: flex;
  gap: 11px;
  align-items: center;
  width: 100%;
  border-radius: 8px;
  padding: 12px;
  text-align: left;
}
.catalog-item:hover {
  background: var(--raised);
}
.catalog-item.selected {
  background: var(--accent-soft);
}
.catalog-item > span:first-of-type {
  flex: 1;
  min-width: 0;
}
.catalog-item strong {
  display: block;
  font-weight: 550;
  font-size: var(--ae-type-caption);
  overflow-wrap: anywhere;
}
.catalog-item small {
  display: block;
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin-top: 3px;
}
.check-box {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border: 1px solid var(--border);
  border-radius: 4px;
  flex-shrink: 0;
}
.selected .check-box {
  background: var(--accent);
  color: var(--theme-on-primary);
  border-color: var(--accent);
}
.candidate {
  margin-bottom: 22px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 20px;
}
.candidate h3 {
  margin-bottom: 9px;
}
.candidate details {
  margin: 12px 0;
}
.fatal-error {
  padding: 80px 30px;
  color: var(--ink);
  background: var(--canvas);
  height: 100%;
}
.fatal-error p {
  margin: 15px 0;
}
.mobile-only,
.mobile-panel-nav,
.drawer-backdrop {
  display: none;
}
@media (min-width: 821px) {
  .workbench.sidebar-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .workbench.sidebar-collapsed.has-panel {
    grid-template-columns: minmax(0, 1fr) 4px minmax(340px, min(var(--panel-width), 48vw));
  }
}
@media (max-width: 1200px) {
  .workbench {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }
  .workbench.has-panel {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr) 4px minmax(340px, 40vw);
  }
  .expanded-panel .work-area {
    left: var(--sidebar-width);
  }
  .starter-grid {
    grid-template-columns: 1fr;
    gap: 6px;
    margin-top: 18px;
  }
  .starter-grid .button {
    align-items: center;
    padding: 10px;
  }
  .starter-grid strong {
    display: inline;
    margin-right: 8px;
  }
  .starter-grid small {
    display: inline;
  }
  .workspace-header {
    padding: 0 16px;
  }
  .transcript {
    padding: 24px 20px;
  }
}
@media (max-width: 820px) {
  .workbench,
  .workbench.has-panel {
    grid-template-columns: minmax(0, 1fr);
  }
  .workbench.has-panel {
    grid-template-columns: minmax(0, 1fr) 4px minmax(340px, 46vw);
  }
  .desktop-sidebar-toggle {
    display: none;
  }
  .sidebar,
  .sidebar-collapsed > .sidebar {
    display: flex;
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(88vw, 310px);
    transform: translateX(-100%);
    z-index: 22;
    box-shadow: 10px 0 30px var(--ui-shadow);
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .sidebar-close {
    align-self: flex-end;
    margin: 8px 12px 0;
  }
  .drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: var(--ui-overlay);
    z-index: 21;
  }
  .mobile-only {
    display: inline-flex;
  }
  .expanded-panel .work-area {
    left: 0;
  }
  .welcome {
    padding-top: 48px;
  }
}
@media (max-width: 720px) {
  .workbench,
  .workbench.has-panel {
    display: flex;
  }
  .main-pane {
    width: 100%;
  }
  .workspace-header {
    height: 54px;
    min-height: 54px;
    padding: 0 12px;
    gap: 7px;
  }
  .workspace-breadcrumb > span,
  .workspace-breadcrumb > svg {
    display: none;
  }
  .workspace-breadcrumb strong {
    font-size: var(--ae-type-caption);
  }
  .work-area,
  .expanded-panel .work-area {
    position: fixed;
    z-index: 10;
    inset: 54px 0 52px;
    box-shadow: 0 -6px 24px var(--ui-shadow);
  }
  .panel-header {
    height: 46px;
  }
  .panel-resizer {
    display: none;
  }
  .mobile-panel-nav {
    display: flex;
    justify-content: space-around;
    border-top: 1px solid var(--line);
    padding: 4px 6px max(4px, env(safe-area-inset-bottom));
    background: var(--rail);
    flex-shrink: 0;
    min-height: 48px;
    z-index: 11;
  }
  .mobile-panel-nav .button {
    font-size: var(--ae-type-caption);
    min-height: 38px;
  }
  .welcome {
    padding: 40px 20px 25px;
    flex: 1;
    min-height: 0;
  }
  .welcome h1 {
    font-size: clamp(1.6rem, 3vw, 2.15rem);
  }
  .welcome-heading p {
    font-size: var(--ae-type-caption);
  }
  .welcome-heading {
    margin-bottom: 23px;
  }
  .welcome-symbol {
    margin-bottom: 15px;
  }
  .composer-area {
    padding: 9px 12px 8px;
  }
  .composer textarea {
    font-size: 16px;
    padding: 14px 64px 8px 14px;
  }
  .composer-footnote {
    font-size: var(--ae-type-caption);
    margin-top: 7px;
  }
  .desktop-only {
    display: none !important;
  }
  .starter-grid {
    margin-bottom: 28px;
  }
  .starter-grid .button {
    min-height: 47px;
  }
  .recent-work button small {
    display: none;
  }
  .transcript {
    padding: 20px 17px 14px;
  }
  .message {
    margin-bottom: 24px;
  }
  .markdown {
    font-size: 14px;
  }
  .task-center {
    padding: 25px 18px;
  }
  .task-row {
    flex-wrap: wrap;
    gap: 8px;
  }
  .task-row > .status {
    margin-left: 27px;
  }
  .task-info {
    flex-basis: calc(100% - 38px);
  }
  .task-actions {
    margin-left: auto;
  }
  .modal-layer {
    padding: 50px 10px 15px;
  }
  .dialog {
    max-height: 85dvh;
  }
  .thread-more {
    opacity: 1;
  }
  .icon-button {
    width: 34px;
    height: 34px;
    min-height: 34px;
  }
  .revision-input textarea {
    font-size: 16px;
  }
  .artifact-title {
    padding: 12px;
  }
  .source-editor {
    font-size: var(--ae-type-caption);
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
:host-context([data-aisecedu-motion='reduced']) * {
  animation: none !important;
  scroll-behavior: auto !important;
}

.conversation-file {
  display: flex;
  align-items: center;
  width: min(100%, 560px);
  min-width: 0;
  padding: 3px 8px 3px 3px;
  margin: 9px 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--raised);
}
.conversation-file:hover,
.conversation-file[data-active='true'] {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
}
.conversation-file[data-active='true'] {
  background: color-mix(in srgb, var(--accent) 5%, var(--raised));
}
.conversation-file-open {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  padding: 9px;
  text-align: left;
  border-radius: 7px;
}
.conversation-file-open:hover {
  background: var(--hover);
}
.conversation-file-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 42px;
  border-radius: 8px;
  color: var(--accent);
  background: var(--accent-soft);
}
.conversation-file-name {
  min-width: 0;
}
.conversation-file-name strong,
.conversation-file-name small {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.conversation-file-name strong {
  font-size: .9rem;
  font-weight: 650;
}
.conversation-file-name small {
  color: var(--muted);
  font-size: var(--ae-type-caption);
}

.file-preview {
  position: relative;
  container-type: inline-size;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: color-mix(in srgb, var(--soft) 82%, var(--rail));
}
.file-preview-toolbar,
.file-preview-footer {
  display: flex;
  align-items: center;
  flex: none;
  gap: 8px;
  justify-content: space-between;
  background: var(--raised);
  color: var(--ink);
}
.file-preview-toolbar {
  min-height: 59px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
}
.file-preview-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 480px;
  flex: 1;
  padding-left: 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--rail);
  color: var(--accent);
}
.file-preview-picker select,
.file-preview-zoom {
  min-height: 36px;
  font-size: var(--ae-type-caption);
  color: var(--ink);
}
.file-preview-picker select {
  width: 100%;
  min-width: 0;
  text-overflow: ellipsis;
  border: 0;
  background: transparent;
  padding: 0 8px 0 0;
  font-weight: 650;
}
.file-preview-picker svg {
  flex: none;
}
.file-preview-tools,
.file-page-controls {
  display: flex;
  align-items: center;
  flex: none;
  gap: 3px;
}
.file-preview-tools .icon-button {
  width: 34px;
  height: 36px;
}
.file-preview-zoom {
  padding: 0 5px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--rail);
}
.file-preview-zoom:disabled {
  opacity: .55;
}
.file-preview-canvas {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.file-preview-canvas:focus-visible {
  outline-offset: -2px;
}
.file-preview-stack {
  display: grid;
  align-content: start;
  justify-items: center;
  width: max-content;
  min-width: 100%;
  padding: 24px;
  gap: 18px;
}
.file-paper,
.file-reading-sheet {
  margin: 0;
  color: #1a2537;
  background: #fff;
  border: 1px solid #d5dbe3;
  box-shadow: 0 3px 9px #18284612;
}
.file-paper {
  position: relative;
  overflow: hidden;
}
.file-paper img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.file-reading-sheet {
  min-height: 320px;
  padding: clamp(18px, 4%, 46px);
  overflow: auto;
  overflow-wrap: anywhere;
  line-height: 1.65;
}
.file-reading-sheet .markdown {
  font-size: inherit;
  color: inherit;
}
.file-reading-sheet pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
  font: .9em/1.6 var(--mono);
}
.file-reading-sheet table {
  border-collapse: collapse;
  width: 100%;
}
.file-reading-sheet th,
.file-reading-sheet td {
  padding: 7px 10px;
  text-align: left;
  border: 1px solid #d5dbe3;
}
.file-reading-sheet th {
  background: #edf1f7;
}
.file-reading-sheet .markdown :where(a, blockquote, code, table) {
  color: #283957;
}
.file-preview-limit {
  color: #495b74;
  margin: 0 0 12px;
  padding: 7px 9px;
  background: #eef3fa;
  font-size: .82em;
}
.file-html-preview {
  display: block;
  height: min(75vh, 950px);
  border: 1px solid #d5dbe3;
  background: #fff;
}
.file-preview-state,
.preview-page-error {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 10px;
  min-height: min(280px, 100%);
  padding: 16px;
  text-align: center;
  color: var(--muted);
}
.preview-page-error {
  position: absolute;
  inset: 0;
  color: #4e617a;
}
.file-preview-footer {
  min-height: 42px;
  padding: 3px 10px 3px 15px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.file-page-controls span {
  min-width: 45px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.file-page-controls .icon-button {
  min-height: 34px;
}
.workbench.has-file-preview .panel-resizer {
  position: relative;
}
.workbench.has-file-preview .panel-resizer::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 3px;
  height: 30px;
  border-radius: 2px;
  background: var(--muted);
  transform: translate(-50%, -50%);
  content: '';
}
@media (min-width: 821px) {
  .workbench.has-panel.has-file-preview {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr) 4px minmax(340px, min(var(--panel-width), 53vw));
  }
}
@media (min-width: 721px) and (max-width: 820px) {
  .workbench.has-panel.has-file-preview {
    grid-template-columns: minmax(0, 1fr) 4px minmax(340px, min(var(--panel-width), 52vw));
  }
}
@media (max-width: 720px) {
  .file-preview-toolbar {
    min-height: 50px;
    padding: 5px 7px;
  }
  .file-preview-stack {
    padding: 14px;
    gap: 12px;
  }
}

@container (max-width: 459px) {
  .file-preview-stack {
    padding: 14px;
    gap: 12px;
  }
}
`;var Cn=J(ye(),1),Sh=class extends P0.Component{state={error:!1};static getDerivedStateFromError(){return{error:!0}}render(){return this.state.error?(0,Cn.jsxs)("div",{className:"fatal-error",children:[(0,Cn.jsx)("h1",{children:"\u5DE5\u4F5C\u53F0\u6682\u65F6\u65E0\u6CD5\u663E\u793A"}),(0,Cn.jsx)("p",{children:"\u540E\u53F0\u4EFB\u52A1\u4ECD\u4F1A\u7EE7\u7EED\uFF0C\u5237\u65B0\u540E\u53EF\u4EE5\u91CD\u65B0\u8BFB\u53D6\u8BB0\u5F55\u3002"}),(0,Cn.jsx)("button",{onClick:()=>location.reload(),children:"\u91CD\u65B0\u6253\u5F00\u5DE5\u4F5C\u53F0"})]}):this.props.children}},Ch=document.getElementById("cocreation-workbench");if(Ch){let e=Ch.attachShadow({mode:"open"}),t=document.createElement("style");t.textContent=U0,e.append(t);let a=document.createElement("div");a.id="workbench-root",e.append(a);let n=new jc(Ch.dataset.ownerId||"");(0,F0.createRoot)(a).render((0,Cn.jsx)(Sh,{children:(0,Cn.jsx)(Np.Provider,{value:n,children:(0,Cn.jsx)(q0,{})})}))}})();
