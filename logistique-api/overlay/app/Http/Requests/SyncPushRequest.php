<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SyncPushRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'device_id' => ['required', 'uuid', 'exists:devices,id'],
            'operations' => ['required', 'array', 'min:1', 'max:'.config('logistique.sync_batch_max')],
            'operations.*.op_id' => ['required', 'uuid'],
            'operations.*.table' => ['required', 'string', 'max:40'],
            'operations.*.record_id' => ['required', 'uuid'],
            'operations.*.operation' => ['required', Rule::in(['create', 'update', 'delete'])],
            'operations.*.payload' => ['nullable', 'array'],
            'operations.*.base_version' => ['nullable', 'integer'],
            'operations.*.client_ts' => ['required', 'date'],
        ];
    }
}
