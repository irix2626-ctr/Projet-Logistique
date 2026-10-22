<?php

namespace App\Http\Requests;

use App\Support\Rules;
use Illuminate\Foundation\Http\FormRequest;

class LotUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return Rules::lotUpdate() + ['version' => ['sometimes', 'integer', 'min:1']];
    }
}
