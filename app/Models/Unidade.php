<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Unidade extends Model
{
    use HasFactory;

    protected $table = 'tb2_unidades';

    protected $primaryKey = 'tb2_id';

    protected $fillable = [
        'tb2_id_origem',
        'tb2_nome',
        'tb2_endereco',
        'tb2_cep',
        'tb2_fone',
        'tb2_cnpj',
        'tb2_localizacao',
        'tb2_status',
    ];

    protected $casts = [
        'tb2_status' => 'integer',
    ];

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('tb2_status', 1);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'tb2_unidade_user', 'tb2_id', 'user_id')->withTimestamps();
    }

    public function configuracaoFiscal(): HasOne
    {
        return $this->hasOne(ConfiguracaoFiscal::class, 'tb2_id', 'tb2_id');
    }

    public function matriz(): BelongsTo
    {
        return $this->belongsTo(Matriz::class, 'matriz_id', 'tb30_id');
    }
}
