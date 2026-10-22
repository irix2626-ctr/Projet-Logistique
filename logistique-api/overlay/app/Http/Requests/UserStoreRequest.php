<?php

namespace App\Http\Requests;

use App\Support\Rules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UserStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'id' => ['required', 'uuid', 'unique:users,id'],
            'nom' => ['required', 'string', 'max:190'],
            'email' => ['required', 'string', 'max:190', 'unique:users,email'],
            'mot_de_passe' => ['required', 'string', Rules::password()],
            'role' => ['sometimes', Rule::in(['admin', 'personnel'])],
        ];
    }
}
