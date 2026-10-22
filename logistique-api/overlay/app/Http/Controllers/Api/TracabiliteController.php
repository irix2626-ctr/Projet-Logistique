<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\Paginates;
use App\Http\Controllers\Controller;
use App\Services\TraceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TracabiliteController extends Controller
{
    use Paginates;

    public function __construct(private TraceService $trace)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $page = $this->trace->journal($request)->cursorPaginate($this->pageSize());

        return response()->json($this->pageOf($page, fn ($row) => TraceService::row($row)));
    }
}
