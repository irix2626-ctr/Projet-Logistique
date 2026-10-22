<?php

namespace App\Http\Requests;

use App\Support\Rules;
use Illuminate\Foundation\Http\FormRequest;

class LotStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return Rules::lotCreate($this->input('id'));
    }
}
