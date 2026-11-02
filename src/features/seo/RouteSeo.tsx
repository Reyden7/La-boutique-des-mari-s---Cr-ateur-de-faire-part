import {useLayoutEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {routeSeo,SEO_IMAGE,websiteStructuredData} from './seo';
export function RouteSeo({privateHome=false}:{privateHome?:boolean}){
 const location=useLocation();
 useLayoutEffect(()=>{
  const data=routeSeo(location.pathname,location.search,privateHome);document.title=data.title;
  const meta=(attribute:'name'|'property',key:string,value:string|null)=>{
   const nodes=[...document.head.querySelectorAll<HTMLMetaElement>(`meta[${attribute}="${key}"]`)];const node=nodes.shift();nodes.forEach(n=>n.remove());
   if(value===null){node?.remove();return;}const target=node??document.createElement('meta');target.setAttribute(attribute,key);target.content=value;if(!node)document.head.append(target);
  };
  meta('name','description',data.description);meta('name','robots',data.robots);
  for(const [key,value] of Object.entries({'og:type':'website','og:site_name':'Le Bureau des Mariés Studio','og:locale':'fr_FR','og:title':data.title,'og:description':data.description,'og:url':data.canonical,'og:image':SEO_IMAGE,'og:image:width':'512','og:image:height':'512','og:image:alt':'Le Bureau des Mariés Studio'}))meta('property',key,value);
  for(const [key,value] of Object.entries({'twitter:card':'summary','twitter:title':data.title,'twitter:description':data.description,'twitter:image':SEO_IMAGE}))meta('name',key,value);
  const links=[...document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')],canonical=links.shift();links.forEach(n=>n.remove());
  if(data.canonical){const target=canonical??document.createElement('link');target.rel='canonical';target.href=data.canonical;if(!canonical)document.head.append(target);}else canonical?.remove();
  document.head.querySelectorAll('script[data-seo="website"]').forEach(n=>n.remove());
  if(data.structuredData){const node=document.createElement('script');node.type='application/ld+json';node.dataset.seo='website';node.textContent=JSON.stringify(websiteStructuredData());document.head.append(node);}
 },[location.pathname,location.search,privateHome]);
 return null;
}
