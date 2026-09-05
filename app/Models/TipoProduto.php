<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TipoProduto extends Model
{
    use HasFactory;

    protected $table = 'tb32_tipo_produto';

    protected $primaryKey = 'tb32_id';

    protected $fillable = [
        'tb32_nome',
        'tb32_ncm',
        'tb32_tipo_ncm',
    ];

    protected $casts = [
        'tb32_tipo_ncm' => 'integer',
    ];

    public function produtos(): HasMany
    {
        return $this->hasMany(Produto::class, 'tb32_id', 'tb32_id');
    }
}
