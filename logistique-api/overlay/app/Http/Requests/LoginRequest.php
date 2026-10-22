<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'structure_id' => ['required', 'uuid', 'exists:structures,id'],
            'identifiant' => ['required', 'string', 'max:190'],
            'mot_de_passe' => ['required', 'string', 'max:255'],
            'device_name' => ['required', 'string', 'max:100'],
            'device_id' => ['nullable', 'uuid'],
        ];
    }
}
