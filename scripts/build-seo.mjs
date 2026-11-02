import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {routeSeo,seoHead,publicIntroHtml,SEO_ORIGIN} from '../src/features/seo/seo.ts';
function withHead(html,metadata){
 return html.replace(/\s*<title>[\s\S]*?<\/title>/gi,'')
  .replace(/<meta\b[^>]*>/gi,tag=>/\bname=["'](?:description|robots|twitter:[^"']+)["']/i.test(tag)||/\bproperty=["']og:[^"']+["']/i.test(tag)?'':tag)
  .replace(/<link\b[^>]*>/gi,tag=>/\brel=["']canonical["']/i.test(tag)?'':tag)
  .replace(/<script\b[^>]*data-seo=["']website["'][^>]*>[\s\S]*?<\/script>/gi,'')
  .replace('</head>',seoHead(metadata)+'\n</head>');
}
export async function buildSeoArtifacts(directory){
 const original=await readFile(path.join(directory,'index.html'),'utf8');
 const root=/<div\s+id=["']root["']\s*>\s*<\/div>/;
 if(!root.test(original))throw new Error('SEO build: expected an empty React root before prerendering');
 const publicHtml=withHead(original,routeSeo('/')).replace(root,`<div id="root">${publicIntroHtml()}</div>`);
 const privateHtml=withHead(original,routeSeo('/studio/private'));
 const notFound=withHead(original,routeSeo('/page-introuvable')).replace(root,'<div id="root"><main class="invite-not-found"><h1>Page introuvable</h1><p>Cette adresse ne correspond à aucune page du Bureau des Mariés.</p><a href="/">Retour à l’accueil</a></main></div>');
 await Promise.all([writeFile(path.join(directory,'index.html'),publicHtml),writeFile(path.join(directory,'_app.html'),privateHtml),writeFile(path.join(directory,'404.html'),notFound)]);
 const sitemap=await readFile(path.join(directory,'sitemap.xml'),'utf8');
 const urls=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
 if(urls.length!==1||urls[0]!==SEO_ORIGIN+'/')throw new Error('SEO build: sitemap must contain only the canonical public home page');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildSeoArtifacts(path.resolve('dist'));
