<?php

namespace App\Http\Requests;

use App\Support\Rules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UserUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = $this->route('user')?->getKey();

        return [
            'nom' => ['sometimes', 'string', 'max:190'],
            'email' => ['sometimes', 'string', 'max:190', Rule::unique('users', 'email')->ignore($id, 'id')],
            'mot_de_passe' => ['sometimes', 'string', Rules::password()],
            'role' => ['sometimes', Rule::in(['admin', 'personnel'])],
        ];
    }
}
