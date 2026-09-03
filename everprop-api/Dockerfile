# syntax=docker/dockerfile:1.7

FROM composer:2 AS composer

FROM php:8.4-fpm-bookworm AS runtime

ARG APP_UID=10001
ARG APP_GID=10001

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        libicu-dev \
        libzip-dev \
        unzip \
    && docker-php-ext-install -j"$(nproc)" bcmath intl opcache pcntl pdo_mysql zip \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/pear

COPY --from=composer /usr/bin/composer /usr/local/bin/composer
COPY docker/php/php.ini /usr/local/etc/php/conf.d/everprop.ini
COPY docker/php/fpm-pool.conf /usr/local/etc/php-fpm.d/zz-everprop.conf

RUN groupadd --gid "${APP_GID}" everprop \
    && useradd --uid "${APP_UID}" --gid "${APP_GID}" --create-home --shell /usr/sbin/nologin everprop \
    && mkdir -p /var/www/html /tmp/php \
    && chown -R everprop:everprop /var/www/html /tmp/php

WORKDIR /var/www/html
USER everprop

EXPOSE 9000
CMD ["php-fpm", "-F"]

FROM runtime AS development

FROM runtime AS production
COPY --chown=everprop:everprop . /var/www/html
RUN APP_ENV=build composer install --no-dev --classmap-authoritative --no-interaction --no-progress \
    && APP_ENV=build php artisan package:discover --ansi

EXPOSE 8080
CMD ["sh", "-c", "php artisan serve --host=0.0.0.0 --port=${PORT:-8080}"]
