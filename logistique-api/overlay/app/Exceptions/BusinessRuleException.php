<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Règle métier violée (stock insuffisant, lot avec sorties, etc.).
 * Rendue en JSON par bootstrap/app.php : { message, code } avec le statut HTTP donné.
 */
class BusinessRuleException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly string $errorCode,
        public readonly int $status = 409,
    ) {
        parent::__construct($message);
    }
}
