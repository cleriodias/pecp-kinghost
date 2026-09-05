<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tb33_dfe_distribuicao_controles')) {
            $this->createControlTable();
        }

        if (Schema::hasTable('tb34_dfe_documentos_receita')) {
            return;
        }

        Schema::create('tb34_dfe_documentos_receita', function (Blueprint $table) {
            $table->bigIncrements('tb34_id');
            $table->unsignedBigInteger('tb33_id')->nullable();
            $table->unsignedBigInteger('tb2_id')->nullable();
            $table->string('tb34_cnpj', 14);
            $table->string('tb34_emitente_cnpj', 14)->nullable();
            $table->string('tb34_ambiente', 20);
            $table->string('tb34_nsu', 15);
            $table->string('tb34_chave_acesso', 44)->nullable();
            $table->string('tb34_schema', 60)->nullable();
            $table->string('tb34_tipo_documento', 40)->nullable();
            $table->string('tb34_modelo', 2)->nullable();
            $table->string('tb34_serie', 10)->nullable();
            $table->unsignedBigInteger('tb34_numero')->nullable();
            $table->string('tb34_status', 30)->default('desconhecido');
            $table->timestamp('tb34_emitida_em')->nullable();
            $table->decimal('tb34_valor_total', 12, 2)->default(0);
            $table->decimal('tb34_valor_icms', 12, 2)->default(0);
            $table->decimal('tb34_valor_pis', 12, 2)->default(0);
            $table->decimal('tb34_valor_cofins', 12, 2)->default(0);
            $table->decimal('tb34_valor_ipi', 12, 2)->default(0);
            $table->decimal('tb34_valor_tributos', 12, 2)->default(0);
            $table->longText('tb34_xml')->nullable();
            $table->timestamps();

            $table
                ->foreign('tb33_id')
                ->references('tb33_id')
                ->on('tb33_dfe_distribuicao_controles')
                ->nullOnDelete();

            $table
                ->foreign('tb2_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->nullOnDelete();

            $table->unique(['tb34_cnpj', 'tb34_ambiente', 'tb34_nsu'], 'tb34_cnpj_ambiente_nsu_unique');
            $table->index('tb34_emitente_cnpj', 'tb34_emitente_cnpj_index');
            $table->index('tb34_chave_acesso', 'tb34_chave_acesso_index');
            $table->index(['tb2_id', 'tb34_emitida_em'], 'tb34_unidade_emitida_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb34_dfe_documentos_receita');
    }

    private function createControlTable(): void
    {
        Schema::create('tb33_dfe_distribuicao_controles', function (Blueprint $table) {
            $table->bigIncrements('tb33_id');
            $table->unsignedBigInteger('tb2_id')->nullable();
            $table->string('tb33_cnpj', 14);
            $table->string('tb33_ambiente', 20);
            $table->string('tb33_uf_autor', 2)->nullable();
            $table->string('tb33_ult_nsu', 15)->default('000000000000000');
            $table->string('tb33_max_nsu', 15)->default('000000000000000');
            $table->timestamp('tb33_ultima_consulta_em')->nullable();
            $table->string('tb33_ultimo_status', 10)->nullable();
            $table->text('tb33_ultima_mensagem')->nullable();
            $table->timestamps();

            $table
                ->foreign('tb2_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->nullOnDelete();

            $table->unique(['tb33_cnpj', 'tb33_ambiente'], 'tb33_cnpj_ambiente_unique');
            $table->index(['tb2_id', 'tb33_ambiente'], 'tb33_unidade_ambiente_index');
        });
    }
};
