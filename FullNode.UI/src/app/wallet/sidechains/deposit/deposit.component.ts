import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, FormControl, Validators, FormBuilder, AbstractControl } from '@angular/forms';

import { ApiService } from '../../../shared/services/api.service';
import { GlobalService } from '../../../shared/services/global.service';
import { ModalService } from '../../../shared/services/modal.service';
import { CoinNotationPipe } from '../../../shared/pipes/coin-notation.pipe';

import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { FeeEstimation } from '../../../shared/classes/fee-estimation';
import { TransactionBuilding } from '../../../shared/classes/transaction-building';
import { WalletInfo } from '../../../shared/classes/wallet-info';

import { DepositConfirmationComponent } from './confirmation/deposit-confirmation.component';
import { TransactionSending } from '../../../shared/classes/transaction-sending';

import { Subscription } from 'rxjs/Subscription';
import 'rxjs/add/operator/debounceTime';
import { BaseForm } from '../../../shared/components/base-form';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'deposit-component',
  templateUrl: './deposit.component.html',
  styleUrls: ['./deposit.component.css'],
})

export class DepositComponent extends BaseForm implements OnInit, OnDestroy {
  public depositForm: FormGroup;
  public coinUnit: string;
  public isDepositing = false;
  public estimatedFee = 0;
  public totalBalance = 0;
  public apiError: string;
  private transactionHex: string;
  private responseMessage: any;
  private errorMessage: string;
  private transaction: TransactionBuilding;
  private walletBalanceSubscription: Subscription;

  formErrors = {
    'address': '',
    'amount': '',
    'fee': '',
    'password': ''
  };

  validationMessages = {
    'address': {
      'required': 'An address is required.',
      'minlength': 'An address is at least 26 characters long.'
    },
    'amount': {
      'required': 'An amount is required.',
      'pattern': 'Enter a valid transaction amount. Only positive numbers and no more than 8 decimals are allowed.',
      'min': 'The amount has to be more or equal to 0.00001 Stratis.',
      'max': 'The total transaction amount exceeds your available balance.'
    },
    'fee': {
      'required': 'A fee is required.'
    },
    'password': {
      'required': 'Your password is required.'
    }
  };

  constructor(
    private apiService: ApiService,
    private globalService: GlobalService,
    private modalService: NgbModal,
    private genericModalService: ModalService,
    public activeModal: NgbActiveModal,
    private fb: FormBuilder) {
      super();
      this.buildDepositForm();
  }

  ngOnInit() {
    this.startSubscriptions();
    this.coinUnit = this.globalService.CoinUnit;
  }

  ngOnDestroy() {
    this.cancelSubscriptions();
  }

  private buildDepositForm(): void {
    this.depositForm = this.fb.group({
      'address': ['', Validators.compose([Validators.required, Validators.minLength(26)])],
      'amount': [
        '',
        Validators.compose([
          Validators.required, Validators.pattern(/^([0-9]+)?(\.[0-9]{0,8})?$/),
          Validators.min(0.00001),
          (control: AbstractControl) => Validators.max((this.totalBalance - this.estimatedFee) / 100000000)(control)])
      ],
      'fee': ['medium', Validators.required],
      'password': ['', Validators.required]
    });

    this.depositForm.valueChanges
      .debounceTime(300)
      .subscribe(data => this.onValueChanged(data));
  }

  onValueChanged(data?: any) {
    if (!this.depositForm) { return; }
    const form = this.depositForm;
    this.validateControls(form, this.formErrors, this.validationMessages);

    this.apiError = '';

    if (this.depositForm.get('address').valid && this.depositForm.get('amount').valid) {
      this.estimateFee();
    }
  }

  public getMaxBalance() {
    const data = {
      walletName: this.globalService.WalletName,
      feeType: this.depositForm.get('fee').value
    };

    let balanceResponse;

    this.apiService
      .getMaximumBalance(data)
      .subscribe(
        response => {
          if (response.status >= 200 && response.status < 400) {
            balanceResponse = response.json();
          }
        },
        error => {
          console.log(error);
          if (error.status === 0) {
            this.apiError = 'Something went wrong while connecting to the API. Please restart the application.';
          } else if (error.status >= 400) {
            if (!error.json().errors[0]) {
              console.log(error);
            } else {
              this.apiError = error.json().errors[0].message;
            }
          }
        },
        () => {
          this.depositForm.patchValue({amount: +new CoinNotationPipe(this.globalService).transform(balanceResponse.maxSpendableAmount)});
          this.estimatedFee = balanceResponse.fee;
        }
      );
  }

  public estimateFee() {
    const transaction = new FeeEstimation(
      this.globalService.WalletName,
      'account 0',
      this.depositForm.get('address').value.trim(),
      this.depositForm.get('amount').value,
      this.depositForm.get('fee').value,
      true
    );

    this.apiService.estimateFee(transaction)
      .subscribe(
        response => {
          if (response.status >= 200 && response.status < 400) {
            this.responseMessage = response.json();
          }
        },
        error => {
          console.log(error);
          if (error.status === 0) {
            this.genericModalService.openModal(null, null);
          } else if (error.status >= 400) {
            if (!error.json().errors[0]) {
              console.log(error);
            } else {
              this.apiError = error.json().errors[0].message;
            }
          }
        },
        () => {
          this.estimatedFee = this.responseMessage;
        }
      )
    ;
  }

  public buildTransaction() {
    this.transaction = new TransactionBuilding(
      this.globalService.WalletName,
      'account 0',
      this.depositForm.get('password').value,
      this.depositForm.get('address').value.trim(),
      this.depositForm.get('amount').value,
      this.depositForm.get('fee').value,
      // TO DO: use coin notation
      this.estimatedFee / 100000000,
      true,
      false
    );

    this.apiService
      .buildTransaction(this.transaction)
      .subscribe(
        response => {
          if (response.status >= 200 && response.status < 400) {
            console.log(response);
            this.responseMessage = response.json();
          }
        },
        error => {
          console.log(error);
          this.isDepositing = false;
          if (error.status === 0) {
            this.apiError = 'Something went wrong while connecting to the API. Please restart the application.';
          } else if (error.status >= 400) {
            if (!error.json().errors[0]) {
              console.log(error);
            } else {
              this.apiError = error.json().errors[0].message;
            }
          }
        },
        () => {
          this.estimatedFee = this.responseMessage.fee;
          this.transactionHex = this.responseMessage.hex;
          if (this.isDepositing) {
            this.depositTransaction(this.transactionHex);
          }
        }
      )
    ;
  }

  public deposit() {
    this.isDepositing = true;
    this.buildTransaction();
  }

  private depositTransaction(hex: string) {
    const transaction = new TransactionSending(hex);
    this.apiService
      .sendTransaction(transaction)
      .subscribe(
        response => {
          if (response.status >= 200 && response.status < 400) {
            this.activeModal.close('Close clicked');
          }
        },
        error => {
          console.log(error);
          this.isDepositing = false;
          if (error.status === 0) {
            this.apiError = 'Something went wrong while connecting to the API. Please restart the application.';
          } else if (error.status >= 400) {
            if (!error.json().errors[0]) {
              console.log(error);
            } else {
              this.apiError = error.json().errors[0].message;
            }
          }
        },
        () => this.openConfirmationModal()
      )
    ;
  }

  private getWalletBalance() {
    const walletInfo = new WalletInfo(this.globalService.WalletName);
    this.walletBalanceSubscription = this.apiService.getWalletBalance(walletInfo)
      .subscribe(
        response =>  {
          if (response.status >= 200 && response.status < 400) {
              const balanceResponse = response.json();
              this.totalBalance = balanceResponse.balances[0].amountConfirmed + balanceResponse.balances[0].amountUnconfirmed;
          }
        },
        error => {
          console.log(error);
          if (error.status === 0) {
            this.cancelSubscriptions();
            this.genericModalService.openModal(null, null);
          } else if (error.status >= 400) {
            if (!error.json().errors[0]) {
              console.log(error);
            } else {
              if (error.json().errors[0].description) {
                this.genericModalService.openModal(null, error.json().errors[0].message);
              } else {
                this.cancelSubscriptions();
                this.startSubscriptions();
              }
            }
          }
        }
      );
  }

  private openConfirmationModal() {
    const modalRef = this.modalService.open(DepositConfirmationComponent, { backdrop: 'static' });
    modalRef.componentInstance.transaction = this.transaction;
    modalRef.componentInstance.transactionFee = this.estimatedFee;
  }

  private cancelSubscriptions() {
    if (this.walletBalanceSubscription) {
      this.walletBalanceSubscription.unsubscribe();
    }
  }

  private startSubscriptions() {
    this.getWalletBalance();
  }
}