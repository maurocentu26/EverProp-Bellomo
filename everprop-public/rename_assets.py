import os
import re

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # We want to replace UI text but avoid changing variable names, import paths, or keys.
    # We will use regex to find words that look like plain text.
    
    # Exact phrase replacements first
    replacements = [
        ("Nueva Propiedad", "Nuevo Activo"),
        ("Nueva propiedad", "Nuevo activo"),
        ("nueva propiedad", "nuevo activo"),
        ("Nuevas propiedades", "Nuevos activos"),
        ("nuevas propiedades", "nuevos activos"),
        ("Propiedades", "Activos"),
        ("propiedades", "activos"),
        ("Propiedad", "Activo"),
        ("propiedad", "activo"),
        ("Propiedad independiente", "Activo independiente"),
    ]

    # Only replace if it's inside quotes or text nodes
    # For a simple safe approach, let's just do a string replace but ONLY for specific known UI labels 
    # to avoid breaking code like property.id or <PropertyCard>

    # Let's find all text nodes in JSX.
    # Actually, a regex that checks word boundaries and is NOT preceded by a dot (like obj.propiedad)
    # and NOT followed by a colon (like propiedad: value) or equal sign (propiedad={value}).
    
    # regex pattern: (?<!\.)\bPropiedad\b(?!\s*[:=])
    # But Wait! What about "Propiedades" in navigation?
    
    def safe_replace(text, old, new):
        # We need to preserve case
        # Match old word not preceded by . or < (to avoid <Property>) and not followed by = or : or .
        pattern = r'(?<![\.<A-Za-z0-9_])' + re.escape(old) + r'(?![\.=:A-Za-z0-9_])'
        return re.sub(pattern, new, text)

    content = safe_replace(content, 'Nueva Propiedad', 'Nuevo Activo')
    content = safe_replace(content, 'Nueva propiedad', 'Nuevo activo')
    content = safe_replace(content, 'nueva propiedad', 'nuevo activo')
    
    content = safe_replace(content, 'Propiedades', 'Activos')
    content = safe_replace(content, 'propiedades', 'activos')
    
    # "la propiedad" -> "el activo"
    content = safe_replace(content, 'la Propiedad', 'el Activo')
    content = safe_replace(content, 'la propiedad', 'el activo')
    content = safe_replace(content, 'La Propiedad', 'El Activo')
    content = safe_replace(content, 'La propiedad', 'El activo')
    
    content = safe_replace(content, 'Propiedad', 'Activo')
    content = safe_replace(content, 'propiedad', 'activo')

    if original != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            replace_in_file(os.path.join(root, file))
