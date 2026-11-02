// The production site already redirects www to this HTTPS primary domain.
export const SEO_ORIGIN='https://laboutiquedesmaries.fr';
export const SEO_IMAGE=SEO_ORIGIN+'/icons/icon-512.png';
export const HOME_SEO={
 title:'Faire-part numérique mariage et naissance | Le Bureau des Mariés',
 description:'Créez un faire-part numérique de mariage ou de naissance personnalisable. Animations, invitation interactive, liens familiaux et réponses de vos invités.',
 heading:'Votre faire-part numérique de mariage ou de naissance',
 introduction:'Imaginez un faire-part personnalisable, animé et interactif pour annoncer vos plus belles nouvelles. Découvrez les modèles et essayez le studio sans compte.',
 sections:[
  {id:'faire-part-mariage',heading:'Un faire-part de mariage personnalisable',text:'Créez votre invitation numérique de mariage à partir d’un modèle. Personnalisez les textes, les photos, les couleurs et les animations pour composer un faire-part qui vous ressemble.'},
  {id:'faire-part-naissance',heading:'Un faire-part de naissance numérique',text:'Annoncez l’arrivée de votre enfant avec un faire-part numérique de naissance. Choisissez un modèle de naissance, ajoutez vos photos et préparez votre annonce dans le même atelier créatif.'},
  {id:'faire-part-interactif',heading:'Un faire-part interactif à partager',text:'Préparez une invitation avec une ouverture animée, les informations de votre événement et un formulaire de réponse si vous le souhaitez. Partagez les liens familiaux et retrouvez les réponses dans votre espace personnel.'},
 ],
};
export interface SeoMetadata {title:string;description:string;robots:string;canonical:string|null;structuredData:boolean}
export function routeSeo(pathname:string,search='',privateHome=false):SeoMetadata{
 const parameters=new URLSearchParams(search);
 const sensitive=[...parameters.keys()].some(key=>['token','access_token','refresh_token','code','recipient_token','session_id','projectid'].includes(key.toLowerCase()));
 if(pathname==='/'&&!privateHome&&!sensitive)return {title:HOME_SEO.title,description:HOME_SEO.description,robots:'index, follow, max-image-preview:large',canonical:SEO_ORIGIN+'/',structuredData:true};
 const title=pathname.startsWith('/i/')?'Invitation privée':pathname==='/'?'Mes faire-part':/^\/(auth|login|reset-password)\/?$/.test(pathname)?'Connexion et compte':/^\/(studio|admin|dashboard|payment)(\/|$)/.test(pathname)||pathname==='/custom-invitation'?'Espace personnel':'Page introuvable';
 return {title:title+' | Le Bureau des Mariés',description:'Espace privé du Bureau des Mariés. Les informations des faire-part et des invités ne sont pas destinées aux moteurs de recherche.',robots:'noindex, nofollow, noarchive, nosnippet',canonical:null,structuredData:false};
}
export const websiteStructuredData=()=>({'@context':'https://schema.org','@type':'WebSite',name:'Le Bureau des Mariés Studio',url:SEO_ORIGIN+'/',inLanguage:'fr',description:HOME_SEO.description});
export const escapeHtml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function seoHead(meta:SeoMetadata){
 const e=escapeHtml;
 return `<title>${e(meta.title)}</title>\n<meta name="description" content="${e(meta.description)}" />\n<meta name="robots" content="${e(meta.robots)}" />\n${meta.canonical?`<link rel="canonical" href="${meta.canonical}" />\n`:''}<meta property="og:type" content="website" />\n<meta property="og:site_name" content="Le Bureau des Mariés Studio" />\n<meta property="og:locale" content="fr_FR" />\n<meta property="og:title" content="${e(meta.title)}" />\n<meta property="og:description" content="${e(meta.description)}" />\n${meta.canonical?`<meta property="og:url" content="${meta.canonical}" />\n`:''}<meta property="og:image" content="${SEO_IMAGE}" />\n<meta property="og:image:width" content="512" />\n<meta property="og:image:height" content="512" />\n<meta property="og:image:alt" content="Le Bureau des Mariés Studio" />\n<meta name="twitter:card" content="summary" />\n<meta name="twitter:title" content="${e(meta.title)}" />\n<meta name="twitter:description" content="${e(meta.description)}" />\n<meta name="twitter:image" content="${SEO_IMAGE}" />\n${meta.structuredData?`<script type="application/ld+json" data-seo="website">${JSON.stringify(websiteStructuredData()).replaceAll('<','\\u003c')}</script>`:''}`;
}
export function publicIntroHtml(){
 return `<main class="home-main"><h1>${escapeHtml(HOME_SEO.heading)}</h1><p>${escapeHtml(HOME_SEO.introduction)}</p>${HOME_SEO.sections.map(s=>`<section id="${s.id}"><h2>${escapeHtml(s.heading)}</h2><p>${escapeHtml(s.text)}</p></section>`).join('')}<a href="/#faire-part-mariage">Découvrir les faire-part de mariage</a> · <a href="/#faire-part-naissance">Découvrir les faire-part de naissance</a></main>`;
}
