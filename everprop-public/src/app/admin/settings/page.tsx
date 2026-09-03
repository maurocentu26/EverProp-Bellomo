"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BellRing, Building2, CheckCircle2, ChevronRight, Globe, Paintbrush, ShieldCheck, SlidersHorizontal, Sparkles, Wifi, Zap } from "lucide-react";
import Link from "next/link";

import Badge from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const sections = [
    { id: "company", label: "Empresa", icon: Building2 },
    { id: "branding", label: "Marca", icon: Paintbrush },
    { id: "notifications", label: "Notificaciones", icon: BellRing },
    { id: "security", label: "Seguridad", icon: ShieldCheck },
    { id: "integrations", label: "Integraciones", icon: Wifi },
];

const highlights = [
    "Autocompletar datos de la inmobiliaria",
    "Notificaciones para nuevos leads y visitas",
    "Modo visual para personalizar la marca",
];

function SectionPill({ active, label, icon: Icon }: { active: boolean; label: string; icon: typeof Globe }) {
    return (
        <button
            type="button"
            className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all",
                active
                    ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/20"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
        >
            <span className={cn("flex size-8 items-center justify-center rounded-lg", active ? "bg-white/10" : "bg-slate-100")}>
                <Icon className="size-4" />
            </span>
            <span className="font-medium">{label}</span>
            <ChevronRight className="ml-auto size-4 opacity-60" />
        </button>
    );
}

export default function SettingsPage() {
    const [progress, setProgress] = useState(0);
    const [activeSection, setActiveSection] = useState("company");

    useEffect(() => {
        const handleScroll = () => {
            const scrollElement = document.documentElement;
            const total = scrollElement.scrollHeight - scrollElement.clientHeight;
            const current = scrollElement.scrollTop;
            setProgress(total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0);

            const offsets = sections
                .map((section) => document.getElementById(section.id))
                .filter((section): section is HTMLElement => Boolean(section))
                .map((section) => ({ id: section.id, top: section.getBoundingClientRect().top }));

            const currentSection = offsets.reduce((winner, section) => {
                if (section.top <= 180) {
                    return section.id;
                }

                return winner;
            }, "company");

            setActiveSection(currentSection);
        };

        handleScroll();
        window.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleScroll);

        return () => {
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
        };
    }, []);

    return (
        <div className="scroll-smooth pb-16">
            <div className="sticky top-0 z-20 -mx-3 mb-8 border-b border-slate-200 bg-slate-50/90 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 md:-mx-6 md:px-6">
                <div className="mx-auto flex w-full max-w-[120rem] items-center gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                            <Sparkles className="size-4 text-slate-900" />
                            Example settings page
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Configuración</h1>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">
                            Ajusta la base de la inmobiliaria, la identidad visual y las integraciones. This is a polished placeholder page for now.
                        </p>
                    </div>
                    <div className="hidden w-40 gap-2 md:flex md:flex-col md:items-end">
                        <span className="text-xs font-medium text-slate-500">Completion</span>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full bg-slate-900 transition-all duration-200" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{Math.round(progress)}%</span>
                    </div>
                </div>
            </div>

            <div className="mx-auto grid w-full max-w-[120rem] gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="sticky top-24 hidden self-start lg:block">
                    <Card className="border-slate-200 shadow-sm">
                        <CardHeader>
                            <CardTitle>Secciones</CardTitle>
                            <CardDescription>Navegación rápida dentro del panel.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {sections.map((section) => {
                                const Icon = section.icon;
                                return <SectionPill key={section.id} active={activeSection === section.id} label={section.label} icon={Icon} />;
                            })}
                        </CardContent>
                    </Card>
                </aside>

                <div className="space-y-6">
                    <Card className="overflow-hidden border-slate-200 shadow-sm">
                        <div className="h-1 bg-linear-to-r from-slate-900 via-slate-500 to-cyan-500" />
                        <CardHeader>
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge>Draft</Badge>
                                <Badge variant="positive">Active</Badge>
                            </div>
                            <CardTitle>Company profile</CardTitle>
                            <CardDescription>General information used across listings, leads and documents.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div id="company" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                                        <Building2 className="size-5" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900">Inmobiliaria A</p>
                                        <p className="text-sm text-slate-500">Company identity and public brand name</p>
                                    </div>
                                </div>
                                <div className="mt-4 space-y-3 text-sm text-slate-600">
                                    {highlights.map((item) => (
                                        <div key={item} className="flex items-start gap-2">
                                            <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
                                            <span>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                                    <Globe className="size-4" />
                                    Public data
                                </div>
                                <div className="mt-4 space-y-4 text-sm text-slate-600">
                                    <p>Website, social links, address, and footer copy will live here.</p>
                                    <div className="rounded-xl bg-slate-50 p-4">
                                        <p className="font-medium text-slate-900">Suggestion</p>
                                        <p className="mt-1">Add the real form controls here when the settings model is ready.</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div id="branding" className="scroll-mt-28 grid gap-4 md:grid-cols-2">
                        <Card className="border-slate-200 shadow-sm">
                            <CardHeader>
                                <CardTitle>Branding</CardTitle>
                                <CardDescription>Typography, colors and logo treatment.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-slate-600">
                                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <Paintbrush className="size-4 text-slate-900" />
                                    Brand palette and UI accents
                                </div>
                                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <Sparkles className="size-4 text-slate-900" />
                                    Hero cover, section illustration and favicon
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-slate-200 shadow-sm">
                            <CardHeader>
                                <CardTitle>Quick actions</CardTitle>
                                <CardDescription>Small utilities for a smoother setup.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button className="w-full justify-between" variant="secondary">
                                    Duplicate current theme
                                    <SlidersHorizontal className="size-4" />
                                </Button>
                                <Button className="w-full justify-between" variant="outline">
                                    Preview public site
                                    <ChevronRight className="size-4" />
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    <div id="notifications" className="scroll-mt-28 grid gap-4 md:grid-cols-2">
                        <Card className="border-slate-200 shadow-sm">
                            <CardHeader>
                                <CardTitle>Notifications</CardTitle>
                                <CardDescription>Who gets alerted when something changes.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-slate-600">
                                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                                    <BellRing className="size-4 text-slate-900" />
                                    New lead and visit alerts
                                </div>
                                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                                    <Zap className="size-4 text-slate-900" />
                                    Smart reminders for follow-ups
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-slate-200 shadow-sm">
                            <CardHeader>
                                <CardTitle>Security</CardTitle>
                                <CardDescription>Access, roles and verification.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-slate-600">
                                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <ShieldCheck className="size-4 text-slate-900" />
                                    MFA and role access controls
                                </div>
                                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <CheckCircle2 className="size-4 text-slate-900" />
                                    Device sessions and audit log
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card id="integrations" className="scroll-mt-28 border-slate-200 shadow-sm">
                        <CardHeader>
                            <CardTitle>Integrations</CardTitle>
                            <CardDescription>Connect calendars, CRM and messaging later.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-3">
                            {[
                                "Calendar sync",
                                "Email automation",
                                "WhatsApp notifications",
                            ].map((item) => (
                                <div key={item} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                                    {item}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div>
                            <p className="font-medium text-slate-900">Ready for the real form</p>
                            <p className="text-sm text-slate-500">This page is a polished placeholder until the settings model is ready.</p>
                        </div>
                        <Button>Save changes</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}