import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {Outlet,createRootRouteWithContext,HeadContent,Scripts} from "@tanstack/react-router";
import {useEffect,type ReactNode} from "react";
import appCss from "../styles.css?url";
import meta from "../app-meta.json";
import {reportHiggsfieldError} from "../lib/higgsfield-error-reporting";
declare const __HF_DESIGN_INSPECTOR__:boolean;
export const Route=createRootRouteWithContext<{queryClient:QueryClient}>()({
head:()=>({meta:[{charSet:"utf-8"},{name:"viewport",content:"width=device-width, initial-scale=1"},{title:meta.og_title},{name:"description",content:meta.og_description},{name:"theme-color",content:"#e8edf0"},{name:"robots",content:"noindex,nofollow"},{property:"og:title",content:meta.og_title},{property:"og:description",content:meta.og_description},{property:"og:type",content:"website"}],links:[{rel:"stylesheet",href:appCss},{rel:"icon",href:"/favicon.svg"}]}),
shellComponent:Shell,component:Root,
notFoundComponent:()=> <div style={{padding:60,fontFamily:"sans-serif"}}><h1>This space is empty.</h1><a href="/">Return to Space Boxes</a></div>,
errorComponent:()=> <div style={{padding:60,fontFamily:"sans-serif"}}><h1>This space could not load.</h1><a href="/">Try again</a></div>
});
function Shell({children}:{children:ReactNode}){return <html lang="en" style={{colorScheme:"light"}}><head><HeadContent/></head><body>{children}<Scripts/></body></html>}
function Root(){const {queryClient}=Route.useRouteContext();useEffect(()=>{if(!__HF_DESIGN_INSPECTOR__)return;void import("../module/design-inspector/runtime").then(({installHiggsfieldDesignInspector})=>installHiggsfieldDesignInspector()).catch(error=>reportHiggsfieldError(error instanceof Error?error:new Error("Inspector failed"),{boundary:"design_inspector"}))},[]);return <QueryClientProvider client={queryClient}><Outlet/></QueryClientProvider>}
