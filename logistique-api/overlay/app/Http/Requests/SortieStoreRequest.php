<?php

namespace App\Http\Requests;

use App\Support\Rules;
use Illuminate\Foundation\Http\FormRequest;

class SortieStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    // Ni pr_sr, ni operateur_id, ni date : tout cela est imposé par le serveur.
    public function rules(): array
    {
        return Rules::sortieStore();
    }
}
