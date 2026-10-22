<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'structure_id' => $this->structure_id,
            'nom' => $this->nom,
            'email' => $this->email,
            'role' => $this->role,
            'must_change_password' => $this->must_change_password,
        ];
    }
}
