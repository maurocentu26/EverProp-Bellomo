<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class SeedBellomoOfficialCopy extends Command
{
    protected $signature = 'everprop:seed-bellomo-copy {--tenant=1 : ID numérico del tenant (default 1)}';

    protected $description = 'Siembra los 32 proyectos oficiales de Bellomo con copy, categorización, portadas y logos para landing.';

    /**
     * @var array<string, array{
     *     name: string,
     *     summary: string,
     *     status_label: string,
     *     description: string,
     *     category: 'LAND_DEVELOPMENT'|'HUASI'|'COMMERCIAL',
     *     features: list<string>,
     *     location: array{city: string, province: string, address: string},
     *     cover_url: string,
     *     logo_url: string
     * }>
     */
    private const OFFICIAL_PROJECTS = [
        // --- LOTEOS ---
        'las-colinas' => [
            'name' => 'Las Colinas 1',
            'summary' => 'Tierra de Sueños',
            'status_label' => 'En venta · Con escritura y posesión',
            'description' => "Ubicado sobre ruta Nacional N° 9, a solo minutos del centro de San Salvador de Jujuy, “Las Colinas 1” es un desarrollo que ofrece a los habitantes 20 hectáreas completamente urbanizadas. Un rincón ubicado entre la capital y Los Alisos, para así poder disfrutar de las actividades que ofrecen cada una de estas ciudades.\n\nUbicación: https://goo.gl/maps/VUhJxtTkFSLzDxpV8",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 250 m²', 'Energía eléctrica', 'Agua potable', 'Cloaca', 'Apertura de calles', 'Cordón cuneta', '100% vendido · 80% habitado', 'Con escritura'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Ruta Nacional N° 9 entre Capital y Los Alisos'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/official/las-colinas/vista-aerea.webp',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/Las%20Colinas%20color.png',
        ],
        'las-colinas-2' => [
            'name' => 'Las Colinas 2',
            'summary' => 'Tierra de Sueños',
            'status_label' => 'Pre-venta · En obra',
            'description' => "Frente a Av. La Quiaca con acceso sobre ruta Nacional N° 9, detrás de “Las Colinas 1” nace “Las colinas 2” un lugar pensado para quienes buscan tranquilidad sin alejarse de la ciudad. Un entorno donde el espacio, el aire libre y la calma se encuentran con la cercanía de los servicios y los principales accesos.\n\nUbicación: https://maps.app.goo.gl/VDN1AE76KfQz9Wxr8",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 300 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Frente a Av. La Quiaca con acceso sobre RN 9'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/COLINAS%20II/render%2002.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/colinas2.png',
        ],
        'el-arrabal' => [
            'name' => 'El Arrabal',
            'summary' => 'Volver a lo esencial, a lo abierto, a lo propio',
            'status_label' => 'Pre-venta · En obra',
            'description' => "En San Vicente, casi llegando a Monterrico, nace El Arrabal, un loteo pensado para quienes buscan volver a lo esencial, a lo abierto, a lo propio. Un espacio donde cada mañana tiene luz de montaña, donde el cielo es más grande, y donde imaginar tu hogar se siente natural, posible y cercano.\n\nUbicación: https://maps.app.goo.gl/pCE3Yuq6KwmXxene6",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 200 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta'],
            'location' => ['city' => 'Monterrico', 'province' => 'Jujuy', 'address' => 'San Vicente, camino a Monterrico'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/land-field.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/El%20Arrabal.png',
        ],
        'la-arbolada' => [
            'name' => 'La Arbolada 1',
            'summary' => 'Terrenos verdes Muy Cerca de Todo',
            'status_label' => 'En venta · Con escritura y posesión',
            'description' => "Un lugar tranquilo en Barrio Sgto. Cabral, con todas las comodidades y servicios, un excelente opción para vivir rodeados del movimientos de los árboles estando cerca de todo. Perfecto para las familias que buscan un lugar donde los buenos vecinos siguen siendo un componente importante para la infancia.\n\nUbicación: https://goo.gl/maps/CdoPKYA4stvWAyWx5",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 300 m²', 'Energía eléctrica', 'Agua potable', 'Cloaca', 'Apertura de calles', 'Cordón cuneta', '90% vendido · 60% habitado', 'Con escritura'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Barrio Sargento Cabral'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/official/la-arbolada/vista-aerea-actual.webp',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/La%20Arbolada%20color.png',
        ],
        'la-arbolada-2' => [
            'name' => 'La Arbolada 2',
            'summary' => 'Respirá tranquilidad',
            'status_label' => 'Pre-venta · En obra',
            'description' => "Un barrio tranquilo a solo pasos del Barrio Sargento Cabral, con todas las comodidades y servicios de la ciudad. Una excelente opción para aquellos que buscan vivir rodeados del silencio y el movimiento de los arboles estando cerca, y con hermosa vista a la ciudad.\n\nUbicación: https://goo.gl/maps/CdoPKYA4stvWAyWx5",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 300 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta', '30% vendido'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Barrio Sargento Cabral'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LA%20ARBOLADA%20II/la%20arbolada%202.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/La%20Arbolada%20color.png',
        ],
        'loteo-arenales' => [
            'name' => 'Los Arenales',
            'summary' => 'Un entorno tranquilo y con gran proyección',
            'status_label' => 'Pre-venta · En obra',
            'description' => "Un entorno tranquilo y con gran proyección, ideal para quienes buscan invertir hoy pensando en el futuro. Loteo “Los Arenales” un lugar con gran potencial de crecimiento, con accesos directos y servicios básicos disponibles.\n\nUbicación: https://maps.app.goo.gl/Th7AcgYe85EZb3pF8",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 250 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Los Arenales'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOTEO%20ARENALES/01.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/Los%20Arenales%20color.png',
        ],
        'el-rocio' => [
            'name' => 'El Rocío',
            'summary' => 'Frescura y tranquilidad',
            'status_label' => 'Pre-venta · Obra finalizada con posesión precaria',
            'description' => "Lotes en El Carmen con el mejor clima y paisajes de la provincia, en pleno corazón de los valles jujeños. Un lugar para soñar, pasando la rotonda de Cafrune, camino al dique por por RN N°9. El ingreso está a escasos metros de Esc. Especial 9 “Nra Sra. del Carmen”. Este emprendimiento posee una ubicación privilegiada a solo minutos de los diques La Ciénaga y Las Maderas.\n\nUbicación: https://goo.gl/maps/62ajzARyuAPveZix6",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 250 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta', '70% vendido', 'Con posesión precaria'],
            'location' => ['city' => 'El Carmen', 'province' => 'Jujuy', 'address' => 'RN N° 9 pasando Rotonda de Cafrune'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/official/el-rocio/vista-aerea.webp',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/El%20Rocio%20color.png',
        ],
        'loteo-san-pablo-1' => [
            'name' => 'San Pablo 1',
            'summary' => 'Tu balcón a la ciudad',
            'status_label' => 'Pre-venta · Próxima posesión precaria',
            'description' => "Lotes en Barrio Coronel Arias a pasos de la nueva terminal, en una nueva expansión de la ciudad. En las faldas del cerro, rodeado de la rica vegetación jujeña y nuestro cielo infinito podrás encontrar al loteo San Pablo, ideal para disfrutar del entorno silvestre sin tenerte que ir muy lejos de la comodidad de la tacita de Plata, con vistas increíbles.\n\nUbicación: https://goo.gl/maps/1UwnW1CDetpP1zAZ8",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 250 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta', '40% vendido', 'Próxima posesión precaria'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Barrio Coronel Arias, faldas del cerro'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/official/san-pablo/vista-aerea-1.webp',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/San%20Pablo%20color.png',
        ],
        'loteo-san-pablo-2' => [
            'name' => 'San Pablo 2',
            'summary' => 'Tu balcón a la ciudad',
            'status_label' => 'Pre-venta · Próxima posesión precaria',
            'description' => "Segunda etapa del loteo San Pablo en Barrio Coronel Arias a pasos de la nueva terminal. Entorno silvestre con vistas excepcionales de la ciudad y conexión rápida a los principales accesos.\n\nUbicación: https://goo.gl/maps/1UwnW1CDetpP1zAZ8",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 250 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta', 'Próxima posesión precaria'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Barrio Coronel Arias'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/official/san-pablo/vista-aerea-1.webp',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/San%20Pablo%20color.png',
        ],
        'valle-verde' => [
            'name' => 'Valle Verde',
            'summary' => 'El valle pensado para vivir',
            'status_label' => 'Pre-venta · Obras casi finalizadas',
            'description' => "En cercanías a Barrio Sargento Cabral, y a pocos metros de Ruta Nacional N° 9 se ubica el loteo Valle Verde, un gran desarrollo con un entorno silvestre a pocos minutos del centro de la ciudad, con fácil acceso al sector comercial del Barrio.\n\nUbicación: https://goo.gl/maps/BHCdb2VzC1QdWKVGA",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 300 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta', '50% vendido'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Cercanías Barrio Sargento Cabral y RN 9'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/official/valle-verde/vista-aerea.webp',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/Valle%20Verde%20color.png',
        ],
        'los-cardinales' => [
            'name' => 'Los Cardinales',
            'summary' => 'Proyecta tu futuro en el lugar correcto',
            'status_label' => 'Pre-venta · En obra',
            'description' => "A solo minutos de la ciudad y cerca de la zona comercial mas vibrante de Alto Comedero, se encuentra Loteo Los Cardinales, un espacio donde la naturaleza y la comodidad se fusionan, rodeados de tranquilidad para construir el hogar que siempre soñaste.\n\nUbicación: https://maps.app.goo.gl/E6jYRGbHVY3j175i9",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 300 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta', '30% vendido', 'Convenio Colegio de Psicólogos'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Barrio Sargento Cabral / Alto Comedero'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/official/los-cardinales/vista-aerea-1.webp',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/Los%20Cardinales.png',
        ],
        'santa-emilia' => [
            'name' => 'Santa Emilia',
            'summary' => 'Urbanización a tu alcance',
            'status_label' => 'Pre-venta · Obras casi finalizadas',
            'description' => "Un desarrollo ubicado en la entrada de la ciudad de Monterrico, a pocas cuadras del centro y muy cerca de la actividad comercial, Santa Emilia es el lugar ideal para las familias que quieren disfrutar de la naturaleza privilegiada que envuelve este rincón único de la provincia.\n\nUbicación: https://maps.app.goo.gl/e4D7Cn3PN2UpFnK39",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 200 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta', '80% vendido'],
            'location' => ['city' => 'Monterrico', 'province' => 'Jujuy', 'address' => 'Entrada a Monterrico, a pocas cuadras del centro'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/official/santa-emilia/paisaje.webp',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/Santa%20Emilia%20color.png',
        ],
        'loteo-los-perales' => [
            'name' => 'Los Perales',
            'summary' => 'Sentite Lejos, Estando Cerca',
            'status_label' => 'En venta · Con servicios habilitados',
            'description' => "Ubicado en uno de los principales barrios de la ciudad, se encuentra el Loteo “Los Perales”, destacándose por los espacios verdes y su cercanía con el centro. Ideal para quienes disfrutan de caminar y estar al aire libre, dentro de un entorno residencial y cerca de una destacada zona comercial.\n\nUbicación: https://goo.gl/maps/JUbmLHpR98dkwHPT8",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 300 m²', 'Energía eléctrica', 'Agua potable', 'Cloaca', 'Apertura de calles', 'Cordón cuneta', '100% vendido', 'Servicios habilitados'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Barrio Los Perales'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/land-field.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/Los%20Perales%20color.png',
        ],
        'rincones-lotes-e-infraestruc' => [
            'name' => 'Rincones de San Pedrito 1',
            'summary' => 'Es para tu familia, es para tu futuro',
            'status_label' => 'Vendido completamente · Con escritura y posesión',
            'description' => "Proyecto desarrollado en dos etapas, en el corazón del Barrio San Pedrito, 316 lotes accesibles, con la financiación justa para los ahora propietarios, bajo la premisa “Es para tu familia, es para tu futuro”. Su primera etapa fue desarrollada y comercializada a partir del Año 2004. Muy cerca de la actividad comercial, centros de salud, escuelas y en cercanía de Av. Eva Perón.\n\nUbicación: https://maps.app.goo.gl/WagjwisPVbzeg5gD7",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 250 m²', 'Agua potable', 'Cloaca', 'Red eléctrica', 'Gas', 'Cordón cuneta', 'Enripiado de calles', '100% vendido'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Barrio San Pedrito, cercanías Av. Eva Perón'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/official-altos-hornos.png',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/rinconesdesp1_coloe.png',
        ],
        'rincones-2' => [
            'name' => 'Rincones de San Pedrito 2',
            'summary' => 'Es para tu familia, es para tu futuro',
            'status_label' => 'Vendido completamente · Con escritura y posesión',
            'description' => "Segunda etapa de Rincones de San Pedrito desarrollada y comercializada a partir de 2008. Completamente consolidado, con servicios de infraestructura y excelente accesibilidad al transporte público y comercios.\n\nUbicación: https://maps.app.goo.gl/WagjwisPVbzeg5gD7",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 250 m²', 'Agua potable', 'Cloaca', 'Red eléctrica', 'Gas', 'Cordón cuneta', 'Enripiado de calles', '100% vendido'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Barrio San Pedrito'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/official-altos-hornos.png',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/rinconesdesp_color.png',
        ],
        'loteo-palpala' => [
            'name' => 'Loteo Palpalá',
            'summary' => 'Viví Cerca',
            'status_label' => 'Vendido completamente · Con posesión y escritura',
            'description' => "Proyecto de urbanización en el centro de la ciudad de Palpalá iniciado en 2012, con un poco más de 130 lotes que van de 200 m² hasta 900 m². Cuenta con servicios completos y Plaza central “Martín Raúl Galán”. Ubicado sobre Ruta Provincial N° 1 cruzando al pulmón verde “paseo de las flores” con la estatua de San Cayetano.\n\nUbicación: https://maps.app.goo.gl/rbfyXenz7ffXrScz8",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes de 200 m² a 900 m²', 'Energía eléctrica', 'Agua potable', 'Cloaca', 'Gas', 'Cordón cuneta', '100% vendido'],
            'location' => ['city' => 'Palpalá', 'province' => 'Jujuy', 'address' => 'Ruta Provincial N° 1, frente al Paseo de las Flores'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/land-field.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/loteopalpal%C3%A1_color-.png',
        ],
        'loteo-martin-raul-galan' => [
            'name' => 'Loteo Martín Raúl Galán',
            'summary' => 'Viví Cerca',
            'status_label' => 'Vendido completamente · Con posesión',
            'description' => "Desarrollo urbano en Palpalá contiguo a plaza central y servicios esenciales. Cercanía inmediata a bancos, escuelas, supermercados y transporte público.\n\nUbicación: https://maps.app.goo.gl/rbfyXenz7ffXrScz8",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 200 m²', 'Energía eléctrica', 'Agua potable', 'Cloaca', 'Gas', 'Cordón cuneta', '100% vendido', 'Próximo a escritura'],
            'location' => ['city' => 'Palpalá', 'province' => 'Jujuy', 'address' => 'Ruta Provincial N° 1, Palpalá'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/land-field.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/loteomrgal%C3%A1n_color.png',
        ],
        'quintas-san-antonio' => [
            'name' => 'Quintas de San Antonio',
            'summary' => 'Donde la naturaleza y lo sofisticado se encuentran en perfecta armonía',
            'status_label' => 'Proyecto futuro',
            'description' => "Sobre ruta provincial N° 2 al norte de San Antonio, este loteo ofrece un lugar donde la naturaleza y lo sofisticado se encuentran en perfecta armonía, un refugio exclusivo ubicado en el corazón de los valles jujeños, diseñado para aquellos que buscan reconectar con la esencia de la vida en familia.\n\nUbicación: https://maps.app.goo.gl/Nj6ksF9m5GNMPFCh8",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 250 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta'],
            'location' => ['city' => 'San Antonio', 'province' => 'Jujuy', 'address' => 'Ruta Provincial N° 2 al norte de San Antonio'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/SAN%20ANTONIO-%20QUINTAS/RENDER%201.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/Quintas%20color.png',
        ],
        'la-toma-loteo' => [
            'name' => 'Loteo La Toma',
            'summary' => 'Vegetación, tranquilidad y llamativos paisajes',
            'status_label' => 'Proyecto futuro',
            'description' => "Sobre ruta provincial N° 2 al norte de San Antonio, en una zona que combina áreas rurales y núcleos de viviendas en crecimiento, se encuentra Loteo “La Toma”, con un entorno rural y abierto. Este loteo ofrece vegetación, tranquilidad, y llamativos paisajes junto a la creciente urbanización.\n\nUbicación: https://maps.app.goo.gl/UweyeRMCTyrhSxr47",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 300 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta'],
            'location' => ['city' => 'San Antonio', 'province' => 'Jujuy', 'address' => 'Ruta Provincial N° 2 al norte de San Antonio'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/SAN%20ANTONIO-%20QUINTAS/RENDER%202.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/Quintas%20color.png',
        ],
        'loteo-el-remanso' => [
            'name' => 'Loteo El Remanso',
            'summary' => 'Más contacto con la naturaleza, cerca de todo',
            'status_label' => 'Proyecto futuro',
            'description' => "A 8 Km del centro de San Salvador de Jujuy, y a tan solo 3 km de la ciudad de Palpalá, se encuentra Loteo El Remanso. A pocos metros de Ruta Provincial N° 1, este loteo ofrece un lugar para quienes buscan un terreno con más contacto con la naturaleza, y con servicios básicos disponibles.\n\nUbicación: https://maps.app.goo.gl/HvWH9GZ7SfF4Snx9A",
            'category' => 'LAND_DEVELOPMENT',
            'features' => ['Lotes desde 200 m²', 'Energía eléctrica', 'Agua potable', 'Apertura de calles', 'Cordón cuneta'],
            'location' => ['city' => 'Palpalá', 'province' => 'Jujuy', 'address' => 'A pocos metros de Ruta Provincial N° 1'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/land-field.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/Logos%20loteos/loteopalpal%C3%A1_color-.png',
        ],

        // --- EDIFICIOS HUASI ---
        'edificio-huasi-1' => [
            'name' => 'Huasi I',
            'summary' => 'El inicio de la comunidad Huasi en pleno centro',
            'status_label' => 'Vendido completamente',
            'description' => 'Ubicación: Belgrano N° 566 - B° Centro. Construcción año 1985. Subsuelo con cocheras, Planta Baja y Entrepiso con locales comerciales, portería y oficinas. 1° al 13° piso con 26 departamentos (2 por piso) de 3 y 4 dormitorios con habitación de servicio y balcones. Terraza con zona de recreación, solario y pileta de natación.',
            'category' => 'HUASI',
            'features' => ['26 Departamentos', '3 y 4 dormitorios', 'Cocheras en subsuelo', 'Locales comerciales', 'Pileta y solario en terraza'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Belgrano N° 566, B° Centro'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/official-huasi-facade.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-1.png',
        ],
        'edificio-huasi-2' => [
            'name' => 'Huasi II',
            'summary' => 'Terminaciones de categoría en el centro de San Pedro',
            'status_label' => 'Vendido completamente',
            'description' => 'Ubicación: San Martín N° 344 – Centro de San Pedro de Jujuy. Construcción año 1992. Dos cuerpos de departamentos vinculados por circulación vertical central. Planta Baja y 3 pisos con ocho departamentos de 3 dormitorios, estar comedor, cocina y 2 baños, pisos de parquet de madera y cerámicos.',
            'category' => 'HUASI',
            'features' => ['8 Departamentos', '3 dormitorios', '2 baños', 'Pisos de parquet', 'San Pedro de Jujuy'],
            'location' => ['city' => 'San Pedro de Jujuy', 'province' => 'Jujuy', 'address' => 'San Martín N° 344, Centro'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/official-huasi-residential.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-2.png',
        ],
        'edificio-huasi-3' => [
            'name' => 'Huasi III',
            'summary' => 'Comunidad residencial y centro comercial en Chijra',
            'status_label' => 'Vendido completamente · Cocheras en alquiler',
            'description' => 'Ubicación: Las Vicuñas N° 587 - B° Chijra. Construcción año 1992. Planta Baja con hall y 8 locales comerciales; 8 plantas con 48 departamentos de 2 dormitorios (64 a 78 m²), estar comedor, cocina, baño principal y toilette. Boxes de tendedero individuales en terraza.',
            'category' => 'HUASI',
            'features' => ['48 Departamentos', '2 dormitorios', '8 Locales comerciales', 'Boxes de tendedero individuales', 'Cocheras'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Las Vicuñas N° 587, B° Chijra'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/official-huasi-facade.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-3.png',
        ],
        'edificio-huasi-4' => [
            'name' => 'Huasi IV',
            'summary' => 'Pionero con ascensor y calefacción central en Alto Padilla',
            'status_label' => 'Vendido completamente',
            'description' => 'Ubicación: República del Uruguay N° 1851 - B° Alto Padilla. Construcción año 2013. Planta Baja y 3 pisos con 12 departamentos de 1 dormitorio (60 m²) y 2 dormitorios (80 m²). Primer edificio en Jujuy con ascensor en tres plantas. Calefacción central, SUM en subsuelo y quincho con asador en azotea.',
            'category' => 'HUASI',
            'features' => ['12 Departamentos', '1 y 2 dormitorios', 'Ascensor', 'Calefacción central', 'SUM y patio', 'Quincho con asador en azotea'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'República del Uruguay N° 1851, B° Alto Padilla'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/official-huasi-residential.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-4.png',
        ],
        'edificio-huasi-5' => [
            'name' => 'Huasi V (Córdoba)',
            'summary' => 'Departamentos y locales comerciales en Alta Córdoba',
            'status_label' => 'Vendido completamente',
            'description' => 'Ubicación: Cervantes esquina Fragueiro, Barrio Alta Córdoba, provincia de Córdoba. Construcción año 2012. PB y 7 pisos con 33 departamentos de 1 dormitorio (40 m²), 2 dormitorios (60 m²) y dúplex de 68 m². 10 locales comerciales distinguidos en Planta Baja. Equipamiento completo con placares y muebles bajo mesada.',
            'category' => 'HUASI',
            'features' => ['33 Departamentos', '1 y 2 dormitorios', 'Dúplex 68 m²', '10 Locales comerciales en PB', 'Mobiliario completo'],
            'location' => ['city' => 'Córdoba', 'province' => 'Córdoba', 'address' => 'Cervantes esq. Fragueiro, Alta Córdoba'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/FOTOS%20HUASIS/H-5%20b.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-5.png',
        ],
        'edificio-huasi-6' => [
            'name' => 'Huasi VI',
            'summary' => 'Terminaciones de primera calidad y DVH en Alto Padilla',
            'status_label' => 'Vendido completamente',
            'description' => 'Ubicación: República del Uruguay N° 1687 - B° Alto Padilla. Construcción año 2015. PB y 3 pisos con 15 departamentos (monoambientes, 1 y 2 dormitorios) con carpintería de aluminio DVH (doble vidriado hermético), calefacción central, ascensor, 10 cocheras en subsuelo, jardín y terraza accesible.',
            'category' => 'HUASI',
            'features' => ['15 Departamentos', 'Monoambientes, 1 y 2 dormitorios', 'Carpintería de aluminio DVH', 'Calefacción central', '10 Cocheras en subsuelo', 'Terraza accesible'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'República del Uruguay N° 1687, B° Alto Padilla'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/web/images/site/official-huasi-facade.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-6.png',
        ],
        'edificio-huasi-7' => [
            'name' => 'Huasi VII',
            'summary' => 'Exclusividad residencial frente a Ciudad Cultural',
            'status_label' => 'Venta en pozo',
            'description' => 'Ubicación: República del Uruguay N° 1821 esq. Río Iguazú - B° Alto Padilla. Construcción año 2026. PB y 2 pisos con 19 departamentos y 16 espacios de cochera en subsuelo. Ubicado a metros de Ciudad Cultural y Parque San Martín, con conexión directa a Ciudad Cultural, UNJu e Infinito por Descubrir. Terminaciones de primera calidad, ascensor y calefacción central.',
            'category' => 'HUASI',
            'features' => ['19 Departamentos', '16 Cocheras en subsuelo', 'Ascensor', 'Calefacción central', 'A metros de Ciudad Cultural'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'República del Uruguay N° 1821 esq. Río Iguazú, B° Alto Padilla'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/H7%20-%20ALTO%20PADILLA/RENDERS/imag%201x.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-7.png',
        ],
        'edificio-huasi-8' => [
            'name' => 'Huasi VIII',
            'summary' => 'Diseño vanguardista y locales comerciales sobre calle Alvear',
            'status_label' => 'En alquiler',
            'description' => 'Ubicación: Alvear N° 1376 - B° Centro. Construcción año 2021. PB y 4 pisos con locales comerciales (4), cocheras comerciales y oficinas/viviendas. Diseño moderno que rompe con la estructura tradicional dándole dinamismo a la fachada, en un sector céntrico consolidado.',
            'category' => 'HUASI',
            'features' => ['4 Locales comerciales', 'Cochera comercial', 'Ascensor', '3 Plantas de oficinas y departamentos', 'Ubicación céntrica estratégica'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Alvear N° 1376, B° Centro'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/EDIFICIO%20ALVEAR/01%20OK.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-8.png',
        ],
        'torre-departamentos-h9' => [
            'name' => 'Huasi IX (Córdoba)',
            'summary' => 'Venta en pozo con valor patrimonial en el centro de Córdoba',
            'status_label' => 'Venta en pozo',
            'description' => 'Ubicación: Calle 27 de Abril N° 960, Centro de la ciudad de Córdoba. Construcción año 2027. PB y 9 pisos con 41 departamentos de 1 y 2 dormitorios, un dúplex, 10 cocheras y asador en azotea. Combina la puesta en valor de una casona histórica con un edificio residencial contemporáneo priorizando confort, luminosidad y funcionalidad.',
            'category' => 'HUASI',
            'features' => ['41 Departamentos', '1 y 2 dormitorios', 'Dúplex exclusivo', '10 Cocheras', 'Asador en azotea', 'Casona histórica restaurada'],
            'location' => ['city' => 'Córdoba', 'province' => 'Córdoba', 'address' => 'Calle 27 de Abril N° 960, Centro'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/HUASI%20IX/02.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-9.png',
        ],

        // --- COMERCIALES / ALQUILER ---
        'galeria-norte-1' => [
            'name' => 'Galería Norte 1',
            'summary' => 'Centro comercial consolidado en Chijra',
            'status_label' => 'En alquiler',
            'description' => 'Ubicado en el Barrio Chijra, Galería Norte 1 cuenta con 36 locales comerciales pensados para abastecer la demanda cotidiana de servicios y comercio de la zona norte de la ciudad.',
            'category' => 'COMMERCIAL',
            'features' => ['36 Locales comerciales', 'Chijra', 'Alta afluencia de público'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Barrio Chijra'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/GALERIA%20CHIJRA%20II/RENDERS/01.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-logo.png',
        ],
        'galeria-norte-2' => [
            'name' => 'Galería Norte 2',
            'summary' => 'Gran paseo comercial en Chijra',
            'status_label' => 'En alquiler',
            'description' => 'Paseo comercial de gran escala en Barrio Chijra con 80 locales comerciales diseñados para empresas, emprendimientos gastronómicos y retail.',
            'category' => 'COMMERCIAL',
            'features' => ['80 Locales comerciales', 'Chijra', 'Paseo comercial moderno'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Barrio Chijra'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/GALERIA%20CHIJRA%20II/RENDERS/02.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-logo.png',
        ],
        'cochera-alvear' => [
            'name' => 'Cocheras Alvear',
            'summary' => 'Estacionamiento por hora y mensual en pleno centro',
            'status_label' => 'En alquiler',
            'description' => 'Ubicadas en calle Alvear, en sector céntrico comercial de la capital jujeña. Modalidad de alquiler mensual y por hora con seguridad y accesibilidad.',
            'category' => 'COMMERCIAL',
            'features' => ['Alquiler mensual', 'Alquiler por hora', 'Seguridad', 'Ubicación céntrica'],
            'location' => ['city' => 'San Salvador de Jujuy', 'province' => 'Jujuy', 'address' => 'Calle Alvear, Centro'],
            'cover_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/EDIFICIO%20ALVEAR/03%20OK.jpg',
            'logo_url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/LOGOS%20HUASIS/huasi-logo.png',
        ],
    ];

    public function handle(): int
    {
        $tenantId = (int) $this->option('tenant');
        $tenant = DB::table('tenants')->where('id', $tenantId)->first();

        if (! $tenant) {
            $this->error("No se encontró ningún tenant con ID {$tenantId}.");

            return self::FAILURE;
        }

        $this->info("Iniciando carga de 32 proyectos oficiales con portadas y logos para el tenant {$tenantId} ({$tenant->slug})...");

        DB::transaction(function () use ($tenantId): void {
            $order = 0;

            foreach (self::OFFICIAL_PROJECTS as $slug => $data) {
                $order++;

                $cover = [
                    'url' => $data['cover_url'],
                    'alt' => "Portada {$data['name']}",
                    'kind' => 'PHOTO',
                ];

                $logo = [
                    'url' => $data['logo_url'],
                    'alt' => "Logo {$data['name']}",
                ];

                // 1. Buscar o crear el proyecto base en la tabla 'projects'
                $project = DB::table('projects')
                    ->where('tenant_id', $tenantId)
                    ->where('name', $data['name'])
                    ->first();

                if (! $project) {
                    $projectType = match ($data['category']) {
                        'HUASI' => 'BUILDING',
                        'LAND_DEVELOPMENT' => 'LAND_DEVELOPMENT',
                        default => 'COMMERCIAL',
                    };

                    $status = str_contains($data['status_label'], 'Pre-venta')
                        ? 'PRE_SALE'
                        : (str_contains($data['status_label'], 'En obra') ? 'UNDER_CONSTRUCTION' : 'COMPLETED');

                    $progress = str_contains($data['status_label'], 'Vendido') ? 100 : 50;

                    $projectId = (int) DB::table('projects')->insertGetId([
                        'tenant_id' => $tenantId,
                        'public_id' => (string) Str::uuid(),
                        'name' => $data['name'],
                        'project_type' => $projectType,
                        'status' => $status,
                        'progress' => $progress,
                        'total_units' => 20,
                        'city' => $data['location']['city'],
                        'province' => $data['location']['province'],
                        'address' => $data['location']['address'],
                        'description' => $data['description'],
                        'masterplan_image_url' => $data['cover_url'],
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                } else {
                    $projectId = (int) $project->id;
                    DB::table('projects')
                        ->where('id', $projectId)
                        ->update([
                            'masterplan_image_url' => $data['cover_url'],
                            'updated_at' => now(),
                        ]);
                }

                // 2. Buscar o crear la ficha en 'project_landing'
                $landingRow = DB::table('project_landing')
                    ->where('tenant_id', $tenantId)
                    ->where('slug', $slug)
                    ->first();

                $content = [
                    'name' => $data['name'],
                    'summary' => $data['summary'],
                    'description' => $data['description'],
                    'category' => $data['category'],
                    'location' => $data['location'],
                    'status_label' => $data['status_label'],
                    'is_featured' => ($order <= 6),
                    'featured_order' => $order,
                    'cover' => $cover,
                    'logo' => $logo,
                    'gallery' => [$cover],
                    'features' => $data['features'],
                    'documents' => [],
                ];

                if (! $landingRow) {
                    DB::table('project_landing')->insert([
                        'tenant_id' => $tenantId,
                        'project_id' => $projectId,
                        'slug' => $slug,
                        'is_visible' => 1,
                        'sort_order' => $order,
                        'content' => json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        'first_published_at' => now(),
                        'updated_at' => now(),
                    ]);

                    $this->line("  [+] Creado con fotos y logo: {$data['name']} ({$slug})");
                } else {
                    DB::table('project_landing')
                        ->where('id', $landingRow->id)
                        ->update([
                            'project_id' => $projectId,
                            'is_visible' => 1,
                            'sort_order' => $order,
                            'content' => json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                            'updated_at' => now(),
                        ]);

                    $this->line("  [*] Actualizado con fotos y logo: {$data['name']} ({$slug})");
                }
            }
        });

        $this->info('Carga de proyectos con fotos y logos de Cloudflare finalizada con éxito.');

        return self::SUCCESS;
    }
}
