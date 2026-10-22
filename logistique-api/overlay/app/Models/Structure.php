<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Structure extends Model
{
    use HasUuids, SoftDeletes;

    protected $table = 'structures';

    protected $fillable = ['id', 'nom'];
}
