<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tb26_configuracoes_fiscais', function (Blueprint $table) {
            $table->bigIncrements('tb26_id');
            $table->unsignedBigInteger('tb2_id')->unique();
            $table->boolean('tb26_emitir_nfe')->default(false);
            $table->boolean('tb26_emitir_nfce')->default(false);
            $table->string('tb26_ambiente', 20)->default('homologacao');
            $table->string('tb26_serie', 10)->default('1');
            $table->unsignedBigInteger('tb26_proximo_numero')->default(1);
            $table->unsignedTinyInteger('tb26_crt')->nullable();
            $table->string('tb26_csc_id', 36)->nullable();
            $table->string('tb26_csc', 255)->nullable();
            $table->string('tb26_certificado_tipo', 2)->nullable();
            $table->string('tb26_certificado_arquivo', 255)->nullable();
            $table->text('tb26_certificado_senha')->nullable();
            $table->string('tb26_razao_social')->nullable();
            $table->string('tb26_nome_fantasia')->nullable();
            $table->string('tb26_ie', 20)->nullable();
            $table->string('tb26_im', 20)->nullable();
            $table->string('tb26_cnae', 10)->nullable();
            $table->string('tb26_logradouro')->nullable();
            $table->string('tb26_numero', 20)->nullable();
            $table->string('tb26_complemento')->nullable();
            $table->string('tb26_bairro', 120)->nullable();
            $table->string('tb26_codigo_municipio', 7)->nullable();
            $table->string('tb26_municipio', 120)->nullable();
            $table->string('tb26_uf', 2)->nullable();
            $table->string('tb26_cep', 8)->nullable();
            $table->string('tb26_telefone', 20)->nullable();
            $table->string('tb26_email')->nullable();
            $table->timestamps();

            $table
                ->foreign('tb2_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb26_configuracoes_fiscais');
    }
};
