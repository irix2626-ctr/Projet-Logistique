<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DocumentStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'id' => ['required', 'uuid'],
            'rattache_type' => ['required', Rule::in(['lot', 'sortie'])],
            'rattache_id' => ['required', 'uuid', function (string $attribute, mixed $value, \Closure $fail) {
                $table = $this->input('rattache_type') === 'lot' ? 'lots' : 'sorties';
                if (! DB::table($table)->where('id', $value)->exists()) {
                    $fail('Rattachement introuvable.');
                }
            }],
            'fichier' => ['required', 'file', 'max:'.config('logistique.upload_max_kb'), 'mimetypes:application/pdf,image/jpeg,image/png'],
        ];
    }
}
