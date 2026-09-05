<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Matriz extends Model
{
    use HasFactory;

    protected $table = 'tb30_matrizes';

    protected $primaryKey = 'tb30_id';

    protected $fillable = [
        'tb30_nome',
        'tb30_slug',
        'tb30_status',
    ];

    protected $casts = [
        'tb30_status' => 'integer',
    ];

    public function unidades(): HasMany
    {
        return $this->hasMany(Unidade::class, 'matriz_id', 'tb30_id');
    }
}
