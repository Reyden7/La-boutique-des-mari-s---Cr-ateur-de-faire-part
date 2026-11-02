import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';import path from 'node:path';
import {HOME_SEO,SEO_ORIGIN,SEO_IMAGE,routeSeo,seoHead,publicIntroHtml} from '../src/features/seo/seo.ts';
import {buildSeoArtifacts} from '../scripts/build-seo.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
async function fixture(){const base=path.resolve('.sites-runtime');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'seo-test-'));
 await writeFile(path.join(dir,'index.html'),'<html lang="fr"><head><title>Old title</title><meta name="description" content="old"><meta name="robots" content="index"><meta property="og:url" content="https://wrong.invalid"><link rel="canonical" href="https://wrong.invalid"><meta name="google-site-verification" content="synthetic-verification"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>');
 await writeFile(path.join(dir,'sitemap.xml'),await read('public/sitemap.xml'));return dir;}
const head=html=>html.match(/<head>([\s\S]*?)<\/head>/)[1];
test('one indexable page uses the existing canonical HTTPS apex, with useful wedding/birth metadata',()=>{
 const seo=routeSeo('/','?utm_source=demo');assert.equal(seo.canonical,'https://laboutiquedesmaries.fr/');assert.match(seo.robots,/^index/);assert.match(seo.title,/mariage et naissance/);
 assert.ok(!seo.canonical.includes('?'));assert.ok(!seo.canonical.includes('www.'));assert.equal(SEO_IMAGE,SEO_ORIGIN+'/icons/icon-512.png');
 for(const text of ['faire-part','mariage','naissance','interactif'])assert.ok(publicIntroHtml().toLowerCase().includes(text));
});
test('private routes, family tokens, recovery URLs and signed-in home never enter canonical/OG metadata',()=>{
 for(const route of ['/auth','/login','/reset-password','/studio/discovery','/studio/private-id','/studio/private-id/rsvp/responses','/admin/templates','/admin/assets','/admin/promo-codes','/dashboard/responses','/custom-invitation','/payment/success','/payment/cancel','/i/private-id','/i/private-id/SECRET_FAMILY_TOKEN','/unknown']){
  const seo=routeSeo(route,'?token=SECRET_QUERY_VALUE');assert.match(seo.robots,/noindex/);assert.equal(seo.canonical,null);assert.equal(seo.structuredData,false);
  const html=seoHead(seo);assert.ok(!html.includes('SECRET_'));assert.ok(!html.includes('private-id'));assert.ok(!html.includes('og:url'));assert.ok(!html.includes('rel="canonical"'));
 }
 assert.equal(routeSeo('/','',true).canonical,null);assert.match(routeSeo('/','?code=SECRET').robots,/noindex/);
});
test('metadata renders one title, one description, one canonical and generic safe sharing tags',()=>{
 const h=seoHead(routeSeo('/'));assert.equal((h.match(/<title>/g)||[]).length,1);assert.equal((h.match(/name="description"/g)||[]).length,1);assert.equal((h.match(/rel="canonical"/g)||[]).length,1);
 assert.match(h,/property="og:locale" content="fr_FR"/);assert.match(h,/name="twitter:card" content="summary"/);assert.match(h,/application\/ld\+json/);
 const escaped=seoHead({...routeSeo('/'),title:'<script>"attack"</script>'});assert.ok(escaped.includes('&lt;script&gt;'));assert.ok(!escaped.includes('<title><script>'));
});
test('build emits useful public HTML, a noindex private shell and a noindex 404 without losing app assets or verification',async()=>{
 const dir=await fixture();await buildSeoArtifacts(dir);
 const home=await readFile(path.join(dir,'index.html'),'utf8'),app=await readFile(path.join(dir,'_app.html'),'utf8'),missing=await readFile(path.join(dir,'404.html'),'utf8');
 assert.match(home,/<h1>Votre faire-part numérique/);assert.match(home,/faire-part de naissance numérique/);assert.equal((head(home).match(/rel="canonical"/g)||[]).length,1);assert.ok(!home.includes('wrong.invalid'));
 for(const html of [home,app,missing]){assert.equal((head(html).match(/<title>/g)||[]).length,1);assert.equal((head(html).match(/name="description"/g)||[]).length,1);assert.ok(html.includes('/assets/app.js'));assert.ok(html.includes('synthetic-verification'));}
 for(const html of [app,missing]){assert.match(head(html),/name="robots" content="noindex/);assert.ok(!head(html).includes('canonical'));assert.ok(!head(html).includes('og:url'));assert.ok(!head(html).includes('application/ld+json'));}
 assert.match(app,/<div id="root"><\/div>/);assert.match(missing,/<h1>Page introuvable<\/h1>/);
});
test('SEO build fails closed if a private URL is mistakenly added to the sitemap',async()=>{
 const dir=await fixture();await writeFile(path.join(dir,'sitemap.xml'),'<urlset><url><loc>'+SEO_ORIGIN+'/i/SECRET/TOKEN</loc></url></urlset>');
 await assert.rejects(()=>buildSeoArtifacts(dir),/sitemap must contain only/);
});
test('robots and sitemap expose only the public canonical page and allow reading private noindex',async()=>{
 const xml=await read('public/sitemap.xml'),robots=await read('public/robots.txt');assert.match(xml,/xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
 const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);assert.deepEqual(urls,[SEO_ORIGIN+'/']);assert.ok(!xml.includes('?')||xml.startsWith('<?xml'));
 assert.ok(robots.includes('Sitemap: '+SEO_ORIGIN+'/sitemap.xml'));assert.match(robots,/Allow: \//);assert.ok(!robots.includes('Disallow: /'));
});
function rules(source){return source.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')).map(x=>{const [from,to,status]=x.split(/\s+/);const re=new RegExp('^'+from.split('/').map(s=>s==='*'?'.*':s.startsWith(':')?'[^/]+':s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'/?$');return {re,to,status:Number(status)};});}
test('Netlify whitelists every app route unchanged and sends unknown URLs to a real 404',async()=>{
 const redirects=rules(await read('public/_redirects')),app=await read('src/App.tsx');const routes=[...app.matchAll(/path: "([^"]+)"/g)].map(m=>m[1]);
 for(const route of routes.filter(p=>p!=='/'&&p!=='*')){const url=route.replaceAll(':projectId','synthetic-project').replaceAll(':publicId','synthetic-invite').replaceAll(':recipientToken','synthetic-token');const rule=redirects.find(r=>r.re.test(url));assert.equal(rule?.status,200,url);assert.equal(rule?.to,'/_app.html',url);}
 for(const url of ['/unknown','/admin/missing','/studio/a/b/c','/i/id/token/unexpected']){const rule=redirects.find(r=>r.re.test(url));assert.equal(rule?.status,404);assert.equal(rule?.to,'/404.html');}
 assert.ok(!app.includes('element: <Navigate to="/" replace />'));assert.ok(app.includes('element: <NotFoundPage />'));
});
test('private HTML and invitation URLs have server noindex; tokens never flow through referrers; no analytics added',async()=>{
 const headers=await read('public/_headers');for(const pattern of ['/_app.html','/auth','/login','/reset-password','/studio/*','/dashboard/*','/admin/*','/i/*','/payment/*'])assert.ok(headers.includes(pattern+'\n')||headers.includes(pattern+'\r\n'));
 assert.match(headers,/\/i\/\*[\s\S]*?Referrer-Policy: no-referrer/);assert.ok(!/^\/\*\s*$/m.test(headers),'public home must not inherit global noindex');
 assert.match(await read('src/components/auth/ProtectedRoute.tsx'),/if \(!user\) return <Navigate to="\/auth"/);
 const packageJson=JSON.parse(await read('package.json'));assert.equal(packageJson.engines.node,'22.x');assert.match(packageJson.scripts.build,/build-seo.mjs/);
 assert.ok(!(await read('index.html')).match(/googletagmanager|google-analytics|gtag\(/));
});
