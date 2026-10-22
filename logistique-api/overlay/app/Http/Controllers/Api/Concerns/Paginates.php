<?php

namespace App\Http\Controllers\Api\Concerns;

/** Pagination par curseur, taille fixe de 100 (README). */
trait Paginates
{
    protected function pageSize(): int
    {
        return (int) config('logistique.per_page');
    }

    /** @param \Illuminate\Contracts\Pagination\CursorPaginator $paginator */
    protected function pageOf($paginator, callable $map): array
    {
        return [
            'data' => collect($paginator->items())->map($map)->values()->all(),
            'next_cursor' => $paginator->nextCursor()?->encode(),
        ];
    }
}
