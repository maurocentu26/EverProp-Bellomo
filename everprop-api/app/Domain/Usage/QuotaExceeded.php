<?php

namespace App\Domain\Usage;

use RuntimeException;

/** Budget exhausted: the caller must derive to a human instead of calling the provider. */
final class QuotaExceeded extends RuntimeException {}
