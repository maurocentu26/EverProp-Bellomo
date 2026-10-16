<?php

namespace App\Domain\Conversations\Exceptions;

use RuntimeException;

/** The provider may or may not have accepted the message. Never retry automatically. */
final class DeliveryAmbiguous extends RuntimeException {}
