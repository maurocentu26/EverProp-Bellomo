"use client";
import { useEffect } from "react";
import { useWebsite } from "./WebsiteProvider";

export default function Promotions() {
  const { content } = useWebsite();
  const promotions = (content.promotions || []).filter(item => item.enabled);
  const visible = promotions.length > 0;
  useEffect(() => {
    if (!visible || window.location.hash !== '#promociones') return;
    const timer = window.setTimeout(() => document.getElementById('promociones')?.scrollIntoView({block:'start'}), 250);
    return () => window.clearTimeout(timer);
  }, [visible]);
  if (!visible) return null;
  return <section id="promociones" className="bellomo-promotions" aria-labelledby="promotions-title">
    <div className="promotions-inner">
      <header className="promotions-heading"><div><p className="promotions-kicker">BELLOMO · PROMOCIONES</p><h2 id="promotions-title" className="font-display">Beneficios para<br/>dar el próximo paso.</h2></div><p>Conocé nuestras propuestas y consultá sus condiciones con el equipo de Bellomo.</p></header>
      <div className="promotions-list">{promotions.map((item,index)=><article key={item.id} className={`promotion-card ${index===0?'promotion-featured':''}`}>
        <div className="promotion-photo"><img src={item.image || '/images/demo-generated/casa.webp'} alt={item.title} loading="lazy"/><span>PROMOCIÓN {String(index+1).padStart(2,'0')}</span>{item.title.match(/\d+(?:[.,]\d+)?\s*%/) && <div className="promotion-benefit"><strong>{item.title.match(/\d+(?:[.,]\d+)?\s*%/)?.[0]}</strong><span>DE DESCUENTO</span></div>}</div>
        <div className="promotion-copy"><p className="promotions-kicker">{item.eyebrow || 'Propuesta Bellomo'}</p><h3 className="font-display">{item.title}</h3><p className="promotion-description">{item.description}</p><div className="promotion-bottom">{item.href && <a href={item.href} className="promotion-cta">{item.buttonLabel || 'Consultar promoción'}<span aria-hidden="true">↗</span></a>}{item.conditions && <p className="promotion-conditions">{item.conditions}</p>}</div></div>
      </article>)}</div>
    </div>
  </section>;
}
