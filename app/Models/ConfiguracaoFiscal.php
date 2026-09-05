<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ConfiguracaoFiscal extends Model
{
    use HasFactory;

    protected $table = 'tb26_configuracoes_fiscais';

    protected $primaryKey = 'tb26_id';

    protected $fillable = [
        'tb2_id',
        'tb26_emitir_nfe',
        'tb26_emitir_nfce',
        'tb26_geracao_automatica_ativa',
        'tb26_limite_imposto_ativo',
        'tb26_limite_imposto_diario',
        'tb26_limite_imposto_mensal',
        'tb26_limite_valor_compra',
        'tb26_limite_imposto_bloqueado_por',
        'tb26_limite_imposto_bloqueado_em',
        'tb26_ambiente',
        'tb26_serie',
        'tb26_proximo_numero',
        'tb26_crt',
        'tb26_csc_id',
        'tb26_csc',
        'tb26_certificado_tipo',
        'tb26_certificado_nome',
        'tb26_certificado_cnpj',
        'tb26_certificado_valido_ate',
        'tb26_certificado_arquivo',
        'tb26_certificado_senha',
        'tb26_certificado_senha_compartilhada',
        'tb26_razao_social',
        'tb26_nome_fantasia',
        'tb26_ie',
        'tb26_im',
        'tb26_cnae',
        'tb26_logradouro',
        'tb26_numero',
        'tb26_complemento',
        'tb26_bairro',
        'tb26_codigo_municipio',
        'tb26_municipio',
        'tb26_uf',
        'tb26_cep',
        'tb26_telefone',
        'tb26_email',
    ];

    protected $casts = [
        'tb26_emitir_nfe' => 'boolean',
        'tb26_emitir_nfce' => 'boolean',
        'tb26_geracao_automatica_ativa' => 'boolean',
        'tb26_limite_imposto_ativo' => 'boolean',
        'tb26_limite_imposto_diario' => 'float',
        'tb26_limite_imposto_mensal' => 'float',
        'tb26_limite_valor_compra' => 'float',
        'tb26_limite_imposto_bloqueado_em' => 'datetime',
        'tb26_proximo_numero' => 'integer',
        'tb26_crt' => 'integer',
        'tb26_certificado_valido_ate' => 'datetime',
    ];

    public function unidade(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'tb2_id', 'tb2_id');
    }

    public function notasFiscais(): HasMany
    {
        return $this->hasMany(NotaFiscal::class, 'tb26_id', 'tb26_id');
    }
}
