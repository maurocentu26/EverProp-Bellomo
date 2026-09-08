"use client";
import {useWebsite} from "./WebsiteProvider";
export function ExtraSections(){const {content}=useWebsite();return <>{content.customSections.filter(s=>s.enabled).map(s=><section key={s.id} id={s.id} className="section"><div className="section-shell"><h2>{s.title}</h2><p>{s.body}</p>{s.image&&<img src={s.image} alt={s.title} style={{maxWidth:'100%',maxHeight:400,objectFit:'contain'}}/>}{s.href&&<a className="button" href={s.href}>{s.buttonLabel||'Ver más'}</a>}</div></section>)}</>;}
